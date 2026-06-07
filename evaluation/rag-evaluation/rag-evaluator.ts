// rag-evaluator.ts - RAG評価スクリプト メインファイル
//
// 実際のSSRツールと同じクエリ生成ロジック（CustomStakeholderQueryEnhancer）を使用
//
// コマンド一覧:
//   export-csv       - 検索結果をCSV形式で出力（ラベリング用・部分評価）
//   export-all-csv   - 全チャンクをCSV形式で出力（完全評価用・横並び）
//   convert-csv      - ラベリング済みCSVをGround Truth JSONに変換（部分評価用）
//   convert-all-csv  - 横並びCSVをGround Truth JSONに変換（完全評価用）
//   evaluate         - クエリ単位での評価を実行
//   evaluate-rrf     - RRF方式での評価（実際のツールと同じ動作）
//   show-queries     - ステークホルダーから生成されるクエリを確認
//   generate-template - Ground Truthテンプレートを生成

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

import {
  EvaluationConfig,
  EvaluationReport,
  QueryEvaluationResult,
  RetrievedChunk,
  ChunkForLabeling,
  Stakeholder,
  RelevantChunk,
  GroundTruthEntry,
} from './types';

import {
  evaluateQuery,
  generateEvaluationReport,
  formatEvaluationReport,
} from './metrics';

import {
  exportChunksToCSV,
  convertToLabelingFormat,
  convertLabeledCSVToGroundTruth,
  loadGroundTruth,
  generateGroundTruthTemplate,
  exportAllChunksToCSV,
  convertAllChunksCSVToGroundTruth,
  loadPriorityMapping,
  AllChunkData,
} from './csv-exporter';
import { CustomStakeholderQueryEnhancer } from './lib/query-enhancer';
import { getDynamicK, getWeightsForStakeholder, generateGenericQueries, getNonAdaptiveK, NON_ADAPTIVE_BASE_RATIO } from './rag-utils-copy';

// 環境変数の読み込み
dotenv.config({ path: '.env.local' });
dotenv.config();

// ============================================================
// デフォルト設定
// ============================================================

const DEFAULT_CONFIG: Partial<EvaluationConfig> = {
  k: 10,
  indexName: process.env.PINECONE_INDEX_NAME || 'ssr-knowledge-base',
  outputDir: './evaluation-results',
};

// ============================================================
// Pinecone / OpenAI クライアント初期化
// ============================================================

function initializeClients(): { pinecone: Pinecone; openai: OpenAI } {
  const pineconeApiKey = process.env.PINECONE_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!pineconeApiKey) {
    throw new Error('PINECONE_API_KEY が設定されていません');
  }

  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY が設定されていません');
  }

  const pinecone = new Pinecone({ apiKey: pineconeApiKey });
  const openai = new OpenAI({ apiKey: openaiApiKey });

  return { pinecone, openai };
}

// ============================================================
// クエリ生成（実際のツールと同じロジック）
// ============================================================

function generateQueriesForStakeholder(stakeholder: Stakeholder): string[] {
  const enhancer = new CustomStakeholderQueryEnhancer();
  return enhancer.enhanceQuery(stakeholder, {
    maxQueries: 5,
    includeEnglish: true,
    includeSynonyms: true,
    includeRoleTerms: true,
  });
}

// ============================================================
// 検索実行
// ============================================================

async function executeSearch(
  openai: OpenAI,
  pinecone: Pinecone,
  query: string,
  namespace: string,
  indexName: string,
  topK: number
): Promise<RetrievedChunk[]> {
  try {
    const index = pinecone.index(indexName);

    // エンベディング生成
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const queryVector = embeddingResponse.data[0].embedding;

    // Pinecone検索
    const searchResults = await index.namespace(namespace).query({
      vector: queryVector,
      topK,
      includeMetadata: true,
    });

    return (searchResults.matches || []).map((match, rank) => ({
      chunkId: match.id,
      fileName: (match.metadata?.fileName as string) || 'unknown',
      content: (match.metadata?.pageContent as string) || '',
      rank: rank + 1,
      score: match.score || 0,
      metadata: match.metadata,
    }));
  } catch (error) {
    console.error(`検索エラー (query: "${query.substring(0, 30)}..."): `, error);
    return [];
  }
}

/**
 * RRF (Reciprocal Rank Fusion) を使用したマルチクエリ検索
 * weights を指定しない場合は均等重み（後方互換）
 */
async function executeRRFSearch(
  openai: OpenAI,
  pinecone: Pinecone,
  queries: string[],
  namespace: string,
  indexName: string,
  topK: number,
  rrfConstant: number = 60,
  weights?: number[]
): Promise<RetrievedChunk[]> {
  const documentScores = new Map<string, {
    chunk: RetrievedChunk;
    rrfScore: number;
    queryHits: Set<string>;
  }>();

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const w = weights?.[i] ?? 1.0;
    const results = await executeSearch(openai, pinecone, query, namespace, indexName, topK * 2);

    results.forEach((chunk, rank) => {
      const existing = documentScores.get(chunk.chunkId);
      const rrfContribution = w * (1 / (rrfConstant + rank + 1));

      if (existing) {
        existing.rrfScore += rrfContribution;
        existing.queryHits.add(query);
      } else {
        documentScores.set(chunk.chunkId, {
          chunk,
          rrfScore: rrfContribution,
          queryHits: new Set([query]),
        });
      }
    });
  }

  return Array.from(documentScores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK)
    .map((item, index) => ({
      ...item.chunk,
      rank: index + 1,
      score: item.rrfScore,
    }));
}

/**
 * 全ファイルリストを取得（Coverage計算用）
 */
async function getAllFiles(
  pinecone: Pinecone,
  namespace: string,
  indexName: string
): Promise<string[]> {
  try {
    const index = pinecone.index(indexName);
    const dummyVector = new Array(1536).fill(0);
    const results = await index.namespace(namespace).query({
      vector: dummyVector,
      topK: 10000,
      includeMetadata: true,
    });

    const fileNames = new Set<string>();
    for (const match of results.matches || []) {
      const fileName = match.metadata?.fileName as string;
      if (fileName) {
        fileNames.add(fileName);
      }
    }

    return Array.from(fileNames);
  } catch (error) {
    console.error('ファイルリスト取得エラー:', error);
    return [];
  }
}

/**
 * Namespaceの総チャンク数を取得
 */
async function getTotalChunks(
  pinecone: Pinecone,
  namespace: string,
  indexName: string
): Promise<number> {
  try {
    const index = pinecone.index(indexName);
    const stats = await index.describeIndexStats();
    const namespaceStats = stats.namespaces?.[namespace];
    return namespaceStats?.recordCount || 0;
  } catch (error) {
    console.error('チャンク数取得エラー:', error);
    return 0;
  }
}

/**
 * Namespaceから全チャンクを取得（ラベリング用）
 */
async function getAllChunks(
  pinecone: Pinecone,
  namespace: string,
  indexName: string
): Promise<AllChunkData[]> {
  try {
    const index = pinecone.index(indexName);
    
    // ダミーベクトルで全件取得（topK: 10000）
    const dummyVector = new Array(1536).fill(0);
    const results = await index.namespace(namespace).query({
      vector: dummyVector,
      topK: 10000,
      includeMetadata: true,
    });

    const chunks: AllChunkData[] = [];
    for (const match of results.matches || []) {
      const fileName = (match.metadata?.fileName as string) || 'unknown';
      const content = (match.metadata?.pageContent as string) || '';
      const chunkIndex = (match.metadata?.chunkIndex as number) || 0;
      
      // chunk_idからnamespace部分を除去（例: cxo_uuid_file.md_3 → uuid_file.md_3）
      // これにより、異なるステークホルダーでも同じチャンク内容は同じIDになる
      const parts = match.id.split('_');
      const stakeholderPrefix = parts[0]; // cxo, technical-fellows等
      const restOfId = parts.slice(1).join('_'); // uuid_file.md_3
      
      chunks.push({
        chunkId: restOfId, // namespace-agnostic ID
        fileName,
        chunkIndex,
        content,
      });
    }

    // chunkIdでソート
    chunks.sort((a, b) => a.chunkId.localeCompare(b.chunkId));

    return chunks;
  } catch (error) {
    console.error('全チャンク取得エラー:', error);
    return [];
  }
}

// ============================================================
// コマンド: export-csv
// ============================================================

async function commandExportTSV(
  namespace: string | undefined,
  uuid: string | undefined,
  stakeholders: Stakeholder[],
  outputPath: string,
  config: Partial<EvaluationConfig> = {}
): Promise<void> {
  console.log('\n📊 ラベリング用TSV出力を開始...\n');
  console.log('🔧 実際のツールと同じクエリ生成ロジック・動的K値を使用します\n');

  const { pinecone, openai } = initializeClients();
  const indexName = config.indexName || DEFAULT_CONFIG.indexName!;
  const fixedK = config.k; // 明示的に指定された場合のみ使用

  const allChunks: ChunkForLabeling[] = [];
  let queryCounter = 0;

  for (let i = 0; i < stakeholders.length; i++) {
    const stakeholder = stakeholders[i];
    
    // namespace決定: 直接指定 or uuid から生成
    const stakeholderNamespace = namespace || `${stakeholder.id}_${uuid}`;
    
    // 総チャンク数を取得（動的K値計算用）
    const totalChunks = await getTotalChunks(pinecone, stakeholderNamespace, indexName);
    
    if (totalChunks === 0) {
      console.warn(`⚠️ Namespace "${stakeholderNamespace}" にチャンクが存在しません。スキップします。`);
      continue;
    }

    // 動的K値を計算（明示的指定がなければ）
    const k = fixedK || getDynamicK(totalChunks, stakeholder, 'pinecone');
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 Stakeholder ${i + 1}/${stakeholders.length}: ${stakeholder.role}`);
    console.log(`   ID: ${stakeholder.id}`);
    console.log(`   Namespace: ${stakeholderNamespace}`);
    console.log(`   Total chunks: ${totalChunks}`);
    console.log(`   Concerns: ${stakeholder.concerns.join(', ')}`);
    console.log(`   Dynamic K: ${k}`);

    const queries = generateQueriesForStakeholder(stakeholder);
    const weights = getWeightsForStakeholder(stakeholder, queries.length);
    console.log(`\n🔍 生成されたクエリ (${queries.length}件):`);
    queries.forEach((q, idx) => console.log(`   ${idx + 1}. ${q} (w=${weights[idx].toFixed(1)})`));

    console.log(`\n🔎 RRF検索を実行中...`);
    const retrievedChunks = await executeRRFSearch(
      openai,
      pinecone,
      queries,
      stakeholderNamespace,
      indexName,
      k,
      60,
      weights
    );
    console.log(`   取得チャンク数: ${retrievedChunks.length} / 目標K: ${k}`);

    // ステークホルダー全体で1つのクエリセットとして扱う
    queryCounter++;
    const queryId = `q${queryCounter}_${stakeholder.id}`;
    const combinedQuery = queries.join(' | ');

    const labelingChunks = convertToLabelingFormat(
      queryId,
      combinedQuery,
      stakeholder.id,
      retrievedChunks
    );

    allChunks.push(...labelingChunks);
  }

  if (allChunks.length === 0) {
    console.error('❌ エラー: 取得できたチャンクがありません。namespaceを確認してください。');
    process.exit(1);
  }

  // 出力ディレクトリの作成
  const outputDir = path.dirname(outputPath);
  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  exportChunksToCSV(allChunks, outputPath);

  // クエリ情報も別ファイルで保存
  const queryInfoPath = outputPath.replace('.csv', '-queries.json');
  const queryInfo = stakeholders.map(s => {
    const ns = namespace || `${s.id}_${uuid}`;
    return {
      stakeholder: s,
      namespace: ns,
      generatedQueries: generateQueriesForStakeholder(s),
    };
  });
  fs.writeFileSync(queryInfoPath, JSON.stringify(queryInfo, null, 2), 'utf-8');
  console.log(`\n📄 クエリ情報を保存: ${queryInfoPath}`);
}

// ============================================================
// コマンド: export-all-csv（全チャンクラベリング用）
// ============================================================

async function commandExportAllChunks(
  uuid: string,
  stakeholderIds: string[],
  outputPath: string,
  priorityFilePath?: string,
  config: Partial<EvaluationConfig> = {}
): Promise<void> {
  console.log('\n📊 全チャンクラベリング用CSV出力を開始...\n');

  const { pinecone } = initializeClients();
  const indexName = config.indexName || DEFAULT_CONFIG.indexName!;

  // 優先度マッピングの読み込み
  let priorityMapping: Map<string, Record<string, number>> | undefined;
  if (priorityFilePath) {
    console.log(`📋 優先度ファイル: ${priorityFilePath}`);
    priorityMapping = loadPriorityMapping(priorityFilePath);
  }

  // 最初のステークホルダーのnamespaceから全チャンクを取得
  // （チャンク内容は全ステークホルダーで共通のため）
  const firstStakeholderId = stakeholderIds[0];
  const namespace = `${firstStakeholderId}_${uuid}`;

  console.log(`📋 Namespace: ${namespace}`);
  console.log(`📋 ステークホルダー列: ${stakeholderIds.join(', ')}`);

  const totalChunks = await getTotalChunks(pinecone, namespace, indexName);
  console.log(`📋 総チャンク数: ${totalChunks}`);

  if (totalChunks === 0) {
    console.error(`❌ Namespace "${namespace}" にチャンクが存在しません。`);
    process.exit(1);
  }

  console.log(`\n🔎 全チャンクを取得中...`);
  const chunks = await getAllChunks(pinecone, namespace, indexName);
  console.log(`   取得: ${chunks.length} 件`);

  // 出力ディレクトリの作成
  const outputDir = path.dirname(outputPath);
  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  exportAllChunksToCSV(chunks, stakeholderIds, outputPath, priorityMapping);
}

// ============================================================
// コマンド: convert-all-csv（横並びCSVからGround Truth JSONへ変換）
// ============================================================

function commandConvertAllChunks(
  inputPath: string,
  outputPath: string,
  uuid: string,
  description: string = '',
  pattern: 1 | 2 = 2  // パターン1: >=1, パターン2: >=2
): void {
  console.log('\n📊 横並びCSV → Ground Truth JSON 変換を開始...\n');
  console.log(`📋 UUID: ${uuid}`);
  
  const minRelevanceScore = pattern === 1 ? 1 : 2;
  
  if (pattern === 1) {
    console.log('📋 パターン1: スコア1以上（◎○△）を正解として評価');
    console.log('   → ノイズ文書が含まれないか評価');
  } else {
    console.log('📋 パターン2: スコア2以上（◎○）を正解として評価');
    console.log('   → ステークホルダーに適合した文書か評価');
  }
  
  convertAllChunksCSVToGroundTruth(inputPath, outputPath, uuid, description, minRelevanceScore);
}

// ============================================================
// コマンド: evaluate
// ============================================================

async function commandEvaluate(
  namespace: string,
  groundTruthPath: string,
  outputDir: string,
  config: Partial<EvaluationConfig> = {}
): Promise<EvaluationReport> {
  console.log('\n📊 RAG評価を開始...\n');

  const { pinecone, openai } = initializeClients();
  const indexName = config.indexName || DEFAULT_CONFIG.indexName!;
  const k = config.k || DEFAULT_CONFIG.k!;

  const groundTruth = loadGroundTruth(groundTruthPath);
  console.log(`✅ Ground Truth 読み込み完了: ${groundTruth.entries.length} 件のクエリ\n`);

  const allFiles = await getAllFiles(pinecone, namespace, indexName);
  console.log(`📁 ナレッジベース内のファイル数: ${allFiles.length}\n`);

  const queryResults: QueryEvaluationResult[] = [];
  const allRetrievedChunks: RetrievedChunk[][] = [];

  for (let i = 0; i < groundTruth.entries.length; i++) {
    const entry = groundTruth.entries[i];
    console.log(`[${i + 1}/${groundTruth.entries.length}] 評価中: "${entry.query.substring(0, 40)}..."`);

    const retrievedChunks = await executeSearch(
      openai,
      pinecone,
      entry.query,
      namespace,
      indexName,
      k
    );

    allRetrievedChunks.push(retrievedChunks);

    const result = evaluateQuery(
      entry.queryId,
      entry.query,
      entry.stakeholderId,
      retrievedChunks,
      entry.relevantChunks,
      k
    );

    queryResults.push(result);

    console.log(`   P@K: ${(result.metrics.precisionAtK * 100).toFixed(1)}%, R@K: ${(result.metrics.recallAtK * 100).toFixed(1)}%, F1: ${(result.metrics.f1AtK * 100).toFixed(1)}%`);
  }

  const report = generateEvaluationReport(
    queryResults,
    allRetrievedChunks,
    allFiles,
    groundTruth.version,
    k,
    namespace
  );

  // 結果出力
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(outputDir, `evaluation-result-${timestamp}.json`);
  const textPath = path.join(outputDir, `evaluation-report-${timestamp}.txt`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  fs.writeFileSync(textPath, formatEvaluationReport(report), 'utf-8');

  console.log(formatEvaluationReport(report));
  console.log(`\n📄 結果ファイル:`);
  console.log(`   JSON: ${jsonPath}`);
  console.log(`   Text: ${textPath}`);

  return report;
}

// ============================================================
// コマンド: evaluate-rrf（推奨）
// ============================================================

async function commandEvaluateRRF(
  namespace: string | undefined,
  uuid: string | undefined,
  stakeholdersPath: string,
  groundTruthPath: string,
  outputDir: string,
  config: Partial<EvaluationConfig> = {}
): Promise<EvaluationReport> {
  console.log('\n📊 RAG評価（RRF方式）を開始...\n');
  console.log('🔧 実際のツールと完全に同じRRF検索方式・動的K値を使用します\n');

  const { pinecone, openai } = initializeClients();
  const indexName = config.indexName || DEFAULT_CONFIG.indexName!;
  const fixedK = config.k; // 明示的に指定された場合のみ使用

  const stakeholders: Stakeholder[] = JSON.parse(fs.readFileSync(stakeholdersPath, 'utf-8'));
  console.log(`✅ Stakeholders 読み込み完了: ${stakeholders.length} 件\n`);

  const groundTruth = loadGroundTruth(groundTruthPath);
  console.log(`✅ Ground Truth 読み込み完了: ${groundTruth.entries.length} 件のクエリ\n`);

  const queryResults: QueryEvaluationResult[] = [];
  const allRetrievedChunks: RetrievedChunk[][] = [];
  const kValues: number[] = []; // 各ステークホルダーのK値を記録
  const allFiles: string[] = [];

  for (const stakeholder of stakeholders) {
    // namespace決定: 直接指定 or uuid から生成
    const stakeholderNamespace = namespace || `${stakeholder.id}_${uuid}`;

    // 総チャンク数を取得（動的K値計算用）
    const totalChunks = await getTotalChunks(pinecone, stakeholderNamespace, indexName);

    if (totalChunks === 0) {
      console.warn(`⚠️ Namespace "${stakeholderNamespace}" にチャンクが存在しません。スキップします。`);
      continue;
    }

    // ファイルリスト取得
    const files = await getAllFiles(pinecone, stakeholderNamespace, indexName);
    allFiles.push(...files);

    // 動的K値を計算（明示的指定がなければ）
    const k = fixedK || getDynamicK(totalChunks, stakeholder, 'pinecone');
    kValues.push(k);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 Stakeholder: ${stakeholder.role} (${stakeholder.id})`);
    console.log(`   Namespace: ${stakeholderNamespace}`);
    console.log(`   Total chunks: ${totalChunks}`);
    console.log(`   Dynamic K: ${k}`);

    const queries = generateQueriesForStakeholder(stakeholder);
    const weights = getWeightsForStakeholder(stakeholder, queries.length);
    console.log(`🔍 生成クエリ: ${queries.length}件`);
    console.log(`   重み: [${weights.map(w => w.toFixed(1)).join(', ')}]`);

    const retrievedChunks = await executeRRFSearch(
      openai,
      pinecone,
      queries,
      stakeholderNamespace,
      indexName,
      k,
      60,
      weights
    );

    allRetrievedChunks.push(retrievedChunks);

    const relevantEntries = groundTruth.entries.filter(
      (e: GroundTruthEntry) => e.stakeholderId === stakeholder.id
    );
    const allRelevantChunks: RelevantChunk[] = relevantEntries.flatMap(
      (e: GroundTruthEntry) => e.relevantChunks
    );
    const uniqueRelevantChunks: RelevantChunk[] = Array.from(
      new Map(allRelevantChunks.map((c: RelevantChunk) => [c.chunkId, c])).values()
    );

    const result = evaluateQuery(
      `rrf_${stakeholder.id}`,
      `[RRF] ${stakeholder.role}`,
      stakeholder.id,
      retrievedChunks,
      uniqueRelevantChunks,
      k
    );

    queryResults.push(result);

    console.log(`   取得: ${retrievedChunks.length}/${k} チャンク`);
    console.log(`   P@K: ${(result.metrics.precisionAtK * 100).toFixed(1)}%, R@K: ${(result.metrics.recallAtK * 100).toFixed(1)}%, F1: ${(result.metrics.f1AtK * 100).toFixed(1)}%`);
  }

  if (queryResults.length === 0) {
    console.error('❌ エラー: 評価できたステークホルダーがありません。');
    process.exit(1);
  }

  // K値の平均を計算（レポート用）
  const avgK = Math.round(kValues.reduce((a, b) => a + b, 0) / kValues.length);

  // ユニークなファイルリスト
  const uniqueFiles = [...new Set(allFiles)];

  const report = generateEvaluationReport(
    queryResults,
    allRetrievedChunks,
    uniqueFiles,
    groundTruth.version,
    avgK, // 平均K値を使用
    uuid || namespace || 'unknown',
    kValues // 動的K値の配列を追加
  );

  // 結果出力
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const timestampDir = path.join(outputDir, timestamp);
  
  if (!fs.existsSync(timestampDir)) {
    fs.mkdirSync(timestampDir, { recursive: true });
  }

  const jsonPath = path.join(timestampDir, `evaluation-rrf-result-${timestamp}.json`);
  const textPath = path.join(timestampDir, `evaluation-rrf-report-${timestamp}.txt`);

  // K値情報をレポートに追加
  const reportWithKInfo = {
    ...report,
    dynamicKValues: stakeholders.map((s, i) => ({
      stakeholderId: s.id,
      namespace: namespace || `${s.id}_${uuid}`,
      k: kValues[i],
    })),
  };

  fs.writeFileSync(jsonPath, JSON.stringify(reportWithKInfo, null, 2), 'utf-8');
  fs.writeFileSync(textPath, formatEvaluationReport(report), 'utf-8');

  console.log(formatEvaluationReport(report));
  console.log(`\n📄 結果ファイル:`);
  console.log(`   JSON: ${jsonPath}`);
  console.log(`   Text: ${textPath}`);

  return report;
}

// ============================================================
// コマンド: convert-csv
// ============================================================

function commandConvertTSV(
  inputPath: string,
  outputPath: string,
  description: string = ''
): void {
  console.log('\n📊 TSV → Ground Truth JSON 変換を開始...\n');
  convertLabeledCSVToGroundTruth(inputPath, outputPath, description);
}

// ============================================================
// コマンド: show-queries
// ============================================================

function commandShowQueries(stakeholdersPath: string): void {
  console.log('\n📊 クエリ生成確認\n');

  const stakeholders: Stakeholder[] = JSON.parse(fs.readFileSync(stakeholdersPath, 'utf-8'));

  for (const stakeholder of stakeholders) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 ${stakeholder.role} (${stakeholder.id})`);
    console.log(`   Concerns: ${stakeholder.concerns.join(', ')}`);

    const queries = generateQueriesForStakeholder(stakeholder);
    console.log(`\n🔍 生成されるクエリ:`);
    queries.forEach((q, idx) => console.log(`   ${idx + 1}. ${q}`));
    console.log('');
  }
}

// ============================================================
// コマンド: generate-template
// ============================================================

function commandGenerateTemplate(outputPath: string): void {
  console.log('\n📊 Ground Truth テンプレートを生成...\n');
  generateGroundTruthTemplate(outputPath);
}

// ============================================================
// コマンド: evaluate-comparison（Adaptive vs Non-Adaptive 比較）
// ============================================================

/** 各ステークホルダーの比較結果 */
interface StakeholderComparisonResult {
  stakeholderId: string;
  stakeholderRole: string;
  totalChunks: number;
  adaptive: {
    k: number;
    queries: string[];
    weights: number[];
    metrics: QueryEvaluationResult;
    retrievedCount: number;
  };
  nonAdaptive: {
    k: number;
    queries: string[];
    weights: number[];
    metrics: QueryEvaluationResult;
    retrievedCount: number;
  };
}

// ============================================================
// コマンド: evaluate-ablation（4条件アブレーション分析）
// ============================================================

interface AblationCondition {
  id: 'baseline' | 'query-expansion-only' | 'adaptive-k-only' | 'full-system';
  label: string;
  enableQueryExpansion: boolean;
  enableAdaptiveK: boolean;
}

interface StakeholderAblationResult {
  stakeholderId: string;
  stakeholderRole: string;
  totalChunks: number;
  relevantChunkCount: number;
  conditions: Record<string, {
    k: number;
    queries: string[];
    weights: number[];
    retrievedCount: number;
    metrics: QueryEvaluationResult;
  }>;
}

const ABLATION_CONDITIONS: AblationCondition[] = [
  {
    id: 'baseline',
    label: 'Baseline',
    enableQueryExpansion: false,
    enableAdaptiveK: false,
  },
  {
    id: 'query-expansion-only',
    label: 'Query Expansion Only',
    enableQueryExpansion: true,
    enableAdaptiveK: false,
  },
  {
    id: 'adaptive-k-only',
    label: 'Adaptive K Only',
    enableQueryExpansion: false,
    enableAdaptiveK: true,
  },
  {
    id: 'full-system',
    label: 'Full System',
    enableQueryExpansion: true,
    enableAdaptiveK: true,
  },
];

function generateBaseQueryForStakeholder(stakeholder: Stakeholder): string[] {
  const terms = [
    stakeholder.role,
    ...stakeholder.concerns,
  ]
    .map(term => term.trim())
    .filter(Boolean);

  return [terms.join(' ') || '安全 リスク 品質 進捗'];
}

function getQueriesForCondition(stakeholder: Stakeholder, condition: AblationCondition): string[] {
  if (condition.enableQueryExpansion) {
    return generateQueriesForStakeholder(stakeholder);
  }

  return generateBaseQueryForStakeholder(stakeholder);
}

function getKForCondition(
  totalChunks: number,
  stakeholder: Stakeholder,
  condition: AblationCondition
): number {
  if (condition.enableAdaptiveK) {
    return getDynamicK(totalChunks, stakeholder, 'pinecone');
  }

  return getNonAdaptiveK(totalChunks);
}

async function commandEvaluateAblation(
  namespace: string | undefined,
  uuid: string | undefined,
  stakeholdersPath: string,
  groundTruthPath: string,
  outputDir: string,
  config: Partial<EvaluationConfig> = {}
): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║              RAG Ablation Analysis                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log('条件: baseline / query-expansion-only / adaptive-k-only / full-system\n');

  const { pinecone, openai } = initializeClients();
  const indexName = config.indexName || DEFAULT_CONFIG.indexName!;

  const stakeholders: Stakeholder[] = JSON.parse(fs.readFileSync(stakeholdersPath, 'utf-8'));
  console.log(`✅ Stakeholders 読み込み完了: ${stakeholders.length} 件`);

  const groundTruth = loadGroundTruth(groundTruthPath);
  console.log(`✅ Ground Truth 読み込み完了: ${groundTruth.entries.length} 件のクエリ\n`);

  const stakeholderResults: StakeholderAblationResult[] = [];
  const conditionQueryResults = new Map<string, QueryEvaluationResult[]>();
  const conditionRetrievedChunks = new Map<string, RetrievedChunk[][]>();
  const conditionKValues = new Map<string, number[]>();
  const allFiles: string[] = [];

  for (const condition of ABLATION_CONDITIONS) {
    conditionQueryResults.set(condition.id, []);
    conditionRetrievedChunks.set(condition.id, []);
    conditionKValues.set(condition.id, []);
  }

  for (const stakeholder of stakeholders) {
    const stakeholderNamespace = namespace || `${stakeholder.id}_${uuid}`;
    const totalChunks = await getTotalChunks(pinecone, stakeholderNamespace, indexName);

    if (totalChunks === 0) {
      console.warn(`⚠️ Namespace "${stakeholderNamespace}" にチャンクが存在しません。スキップします。`);
      continue;
    }

    const files = await getAllFiles(pinecone, stakeholderNamespace, indexName);
    allFiles.push(...files);

    const relevantEntries = groundTruth.entries.filter(
      (e: GroundTruthEntry) => e.stakeholderId === stakeholder.id
    );
    const allRelevantChunks: RelevantChunk[] = relevantEntries.flatMap(
      (e: GroundTruthEntry) => e.relevantChunks
    );
    const uniqueRelevantChunks: RelevantChunk[] = Array.from(
      new Map(allRelevantChunks.map((c: RelevantChunk) => [c.chunkId, c])).values()
    );

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📋 ${stakeholder.role} (${stakeholder.id})`);
    console.log(`   Namespace: ${stakeholderNamespace}`);
    console.log(`   Total chunks: ${totalChunks}`);
    console.log(`   Ground Truth: ${uniqueRelevantChunks.length} 件`);

    const stakeholderResult: StakeholderAblationResult = {
      stakeholderId: stakeholder.id,
      stakeholderRole: stakeholder.role,
      totalChunks,
      relevantChunkCount: uniqueRelevantChunks.length,
      conditions: {},
    };

    for (const condition of ABLATION_CONDITIONS) {
      const k = getKForCondition(totalChunks, stakeholder, condition);
      const queries = getQueriesForCondition(stakeholder, condition);
      const weights = condition.enableQueryExpansion
        ? getWeightsForStakeholder(stakeholder, queries.length)
        : Array(queries.length).fill(1.0);

      console.log(`\n   ${condition.label}:`);
      console.log(`      Query expansion=${condition.enableQueryExpansion ? 'on' : 'off'}, Adaptive K=${condition.enableAdaptiveK ? 'on' : 'off'}`);
      console.log(`      K=${k}, Queries=${queries.length}, Weights=[${weights.map(w => w.toFixed(1)).join(', ')}]`);

      const retrievedChunks = await executeRRFSearch(
        openai,
        pinecone,
        queries,
        stakeholderNamespace,
        indexName,
        k,
        60,
        weights
      );

      const result = evaluateQuery(
        `${condition.id}_${stakeholder.id}`,
        `[${condition.label}] ${stakeholder.role}`,
        stakeholder.id,
        retrievedChunks,
        uniqueRelevantChunks,
        k
      );

      conditionQueryResults.get(condition.id)!.push(result);
      conditionRetrievedChunks.get(condition.id)!.push(retrievedChunks);
      conditionKValues.get(condition.id)!.push(k);

      stakeholderResult.conditions[condition.id] = {
        k,
        queries,
        weights,
        retrievedCount: retrievedChunks.length,
        metrics: result,
      };

      console.log(`      取得: ${retrievedChunks.length}/${k}`);
      console.log(`      P@K: ${(result.metrics.precisionAtK * 100).toFixed(1)}%, R@K: ${(result.metrics.recallAtK * 100).toFixed(1)}%, F1: ${(result.metrics.f1AtK * 100).toFixed(1)}%, nDCG: ${result.metrics.ndcgAtK.toFixed(3)}`);
    }

    stakeholderResults.push(stakeholderResult);
  }

  if (stakeholderResults.length === 0) {
    console.error('❌ エラー: 評価できたステークホルダーがありません。');
    process.exit(1);
  }

  const uniqueFiles = [...new Set(allFiles)];
  const conditionReports: Record<string, EvaluationReport> = {};

  for (const condition of ABLATION_CONDITIONS) {
    const kValues = conditionKValues.get(condition.id)!;
    const avgK = Math.round(kValues.reduce((a, b) => a + b, 0) / kValues.length);

    conditionReports[condition.id] = generateEvaluationReport(
      conditionQueryResults.get(condition.id)!,
      conditionRetrievedChunks.get(condition.id)!,
      uniqueFiles,
      groundTruth.version,
      avgK,
      uuid || namespace || 'unknown',
      kValues
    );
  }

  const ablationText = formatAblationReport(stakeholderResults, conditionReports);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const timestampDir = path.join(outputDir, `ablation-${timestamp}`);

  if (!fs.existsSync(timestampDir)) {
    fs.mkdirSync(timestampDir, { recursive: true });
  }

  const ablationJsonPath = path.join(timestampDir, `ablation-result-${timestamp}.json`);
  const ablationTextPath = path.join(timestampDir, `ablation-report-${timestamp}.txt`);

  const ablationJson = {
    timestamp: new Date().toISOString(),
    groundTruthVersion: groundTruth.version,
    uuid: uuid || namespace || 'unknown',
    conditions: ABLATION_CONDITIONS,
    summary: Object.fromEntries(
      ABLATION_CONDITIONS.map(condition => [
        condition.id,
        conditionReports[condition.id].summary,
      ])
    ),
    stakeholderResults: stakeholderResults.map(result => ({
      stakeholderId: result.stakeholderId,
      stakeholderRole: result.stakeholderRole,
      totalChunks: result.totalChunks,
      relevantChunkCount: result.relevantChunkCount,
      conditions: Object.fromEntries(
        Object.entries(result.conditions).map(([conditionId, conditionResult]) => [
          conditionId,
          {
            k: conditionResult.k,
            queries: conditionResult.queries,
            weights: conditionResult.weights,
            retrievedCount: conditionResult.retrievedCount,
            metrics: conditionResult.metrics.metrics,
            hits: conditionResult.metrics.hits,
          },
        ])
      ),
    })),
  };

  fs.writeFileSync(ablationJsonPath, JSON.stringify(ablationJson, null, 2), 'utf-8');
  fs.writeFileSync(ablationTextPath, ablationText, 'utf-8');

  for (const condition of ABLATION_CONDITIONS) {
    const reportPath = path.join(timestampDir, `${condition.id}-result-${timestamp}.json`);
    fs.writeFileSync(
      reportPath,
      JSON.stringify({
        ...conditionReports[condition.id],
        kValues: conditionKValues.get(condition.id),
      }, null, 2),
      'utf-8'
    );
  }

  console.log(ablationText);
  console.log(`\n📄 結果ファイル:`);
  console.log(`   アブレーションJSON: ${ablationJsonPath}`);
  console.log(`   アブレーションText: ${ablationTextPath}`);
  console.log(`   条件別JSON:         ${timestampDir}/*-result-${timestamp}.json`);
}

function formatAblationReport(
  results: StakeholderAblationResult[],
  reports: Record<string, EvaluationReport>
): string {
  const lines: string[] = [];
  const baselineSummary = reports.baseline.summary;

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════════════════╗');
  lines.push('║                    RAG Ablation Analysis Report                         ║');
  lines.push('╚══════════════════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`評価日時: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('条件定義:');
  lines.push('  baseline             = 非拡張クエリ + 非適応K');
  lines.push('  query-expansion-only = 拡張クエリ + 非適応K');
  lines.push('  adaptive-k-only      = 非拡張クエリ + 適応型K');
  lines.push('  full-system          = 拡張クエリ + 適応型K');
  lines.push('');

  lines.push(`${'━'.repeat(74)}`);
  lines.push('■ 全体サマリー（平均との差分はbaseline比）');
  lines.push('');
  lines.push('  ┌──────────────────────┬──────┬──────────┬──────────┬──────────┬──────────┬──────────┐');
  lines.push('  │ 条件                 │ AvgK │ P@K      │ R@K      │ F1@K     │ MRR      │ nDCG@K   │');
  lines.push('  ├──────────────────────┼──────┼──────────┼──────────┼──────────┼──────────┼──────────┤');

  for (const condition of ABLATION_CONDITIONS) {
    const report = reports[condition.id];
    lines.push(formatAblationSummaryRow(condition.id, report, baselineSummary));
  }

  lines.push('  └──────────────────────┴──────┴──────────┴──────────┴──────────┴──────────┴──────────┘');
  lines.push('');

  const qe = reports['query-expansion-only'].summary.avgNdcgAtK - baselineSummary.avgNdcgAtK;
  const ak = reports['adaptive-k-only'].summary.avgNdcgAtK - baselineSummary.avgNdcgAtK;
  const full = reports['full-system'].summary.avgNdcgAtK - baselineSummary.avgNdcgAtK;
  const interaction = full - qe - ak;

  lines.push('要因分解（nDCG@K, baseline比）:');
  lines.push(`  クエリ拡張単独: ${formatDelta(qe, false)}`);
  lines.push(`  適応型K単独:    ${formatDelta(ak, false)}`);
  lines.push(`  フルシステム:   ${formatDelta(full, false)}`);
  lines.push(`  交互作用目安:   ${formatDelta(interaction, false)}  (full - queryExpansion - adaptiveK)`);
  lines.push('');

  for (const result of results) {
    lines.push(`${'━'.repeat(74)}`);
    lines.push(`■ ${result.stakeholderRole} (${result.stakeholderId})`);
    lines.push(`  総チャンク: ${result.totalChunks}, Ground Truth: ${result.relevantChunkCount}`);
    lines.push('');
    lines.push('  ┌──────────────────────┬──────┬───────┬──────────┬──────────┬──────────┬──────────┐');
    lines.push('  │ 条件                 │ K    │ Query │ P@K      │ R@K      │ F1@K     │ nDCG@K   │');
    lines.push('  ├──────────────────────┼──────┼───────┼──────────┼──────────┼──────────┼──────────┤');

    for (const condition of ABLATION_CONDITIONS) {
      const conditionResult = result.conditions[condition.id];
      const metrics = conditionResult.metrics.metrics;
      lines.push(formatStakeholderAblationRow(
        condition.id,
        conditionResult.k,
        conditionResult.queries.length,
        metrics.precisionAtK,
        metrics.recallAtK,
        metrics.f1AtK,
        metrics.ndcgAtK
      ));
    }

    lines.push('  └──────────────────────┴──────┴───────┴──────────┴──────────┴──────────┴──────────┘');
    lines.push('');
  }

  return lines.join('\n');
}

function formatAblationSummaryRow(
  conditionId: string,
  report: EvaluationReport,
  baseline: EvaluationReport['summary']
): string {
  const summary = report.summary;
  const label = conditionId.padEnd(20);
  const k = report.config.k.toString().padStart(4);

  return [
    `  │ ${label} │`,
    `${k} │`,
    `${formatPercentWithDelta(summary.avgPrecisionAtK, summary.avgPrecisionAtK - baseline.avgPrecisionAtK)} │`,
    `${formatPercentWithDelta(summary.avgRecallAtK, summary.avgRecallAtK - baseline.avgRecallAtK)} │`,
    `${formatPercentWithDelta(summary.avgF1AtK, summary.avgF1AtK - baseline.avgF1AtK)} │`,
    `${formatMetricWithDelta(summary.mrr, summary.mrr - baseline.mrr)} │`,
    `${formatMetricWithDelta(summary.avgNdcgAtK, summary.avgNdcgAtK - baseline.avgNdcgAtK)} │`,
  ].join('');
}

function formatStakeholderAblationRow(
  conditionId: string,
  k: number,
  queryCount: number,
  precision: number,
  recall: number,
  f1: number,
  ndcg: number
): string {
  return `  │ ${conditionId.padEnd(20)} │${k.toString().padStart(4)}  │${queryCount.toString().padStart(5)}  │${formatPercent(precision)} │${formatPercent(recall)} │${formatPercent(f1)} │${ndcg.toFixed(4).padStart(8)} │`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`.padStart(8);
}

function formatDelta(value: number, percent: boolean): string {
  const sign = value >= 0 ? '+' : '';
  return percent
    ? `${sign}${(value * 100).toFixed(1)}pp`
    : `${sign}${value.toFixed(4)}`;
}

function formatPercentWithDelta(value: number, delta: number): string {
  return `${formatPercent(value)} ${formatDelta(delta, true).padStart(8)}`.padStart(18);
}

function formatMetricWithDelta(value: number, delta: number): string {
  return `${value.toFixed(4).padStart(8)} ${formatDelta(delta, false).padStart(8)}`.padStart(18);
}

async function commandEvaluateComparison(
  namespace: string | undefined,
  uuid: string | undefined,
  stakeholdersPath: string,
  groundTruthPath: string,
  outputDir: string,
  config: Partial<EvaluationConfig> = {}
): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║       Adaptive vs Non-Adaptive 比較評価                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const { pinecone, openai } = initializeClients();
  const indexName = config.indexName || DEFAULT_CONFIG.indexName!;

  const stakeholders: Stakeholder[] = JSON.parse(fs.readFileSync(stakeholdersPath, 'utf-8'));
  console.log(`✅ Stakeholders 読み込み完了: ${stakeholders.length} 件`);

  const groundTruth = loadGroundTruth(groundTruthPath);
  console.log(`✅ Ground Truth 読み込み完了: ${groundTruth.entries.length} 件のクエリ\n`);

  const comparisonResults: StakeholderComparisonResult[] = [];

  // Adaptive 用の集計
  const adaptiveQueryResults: QueryEvaluationResult[] = [];
  const adaptiveAllChunks: RetrievedChunk[][] = [];
  const adaptiveKValues: number[] = [];

  // Non-Adaptive 用の集計
  const nonAdaptiveQueryResults: QueryEvaluationResult[] = [];
  const nonAdaptiveAllChunks: RetrievedChunk[][] = [];
  const nonAdaptiveKValues: number[] = [];

  const allFiles: string[] = [];

  for (const stakeholder of stakeholders) {
    const stakeholderNamespace = namespace || `${stakeholder.id}_${uuid}`;
    const totalChunks = await getTotalChunks(pinecone, stakeholderNamespace, indexName);

    if (totalChunks === 0) {
      console.warn(`⚠️ Namespace "${stakeholderNamespace}" にチャンクが存在しません。スキップします。`);
      continue;
    }

    const files = await getAllFiles(pinecone, stakeholderNamespace, indexName);
    allFiles.push(...files);

    // Ground Truth 取得
    const relevantEntries = groundTruth.entries.filter(
      (e: GroundTruthEntry) => e.stakeholderId === stakeholder.id
    );
    const allRelevantChunks: RelevantChunk[] = relevantEntries.flatMap(
      (e: GroundTruthEntry) => e.relevantChunks
    );
    const uniqueRelevantChunks: RelevantChunk[] = Array.from(
      new Map(allRelevantChunks.map((c: RelevantChunk) => [c.chunkId, c])).values()
    );

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📋 ${stakeholder.role} (${stakeholder.id})`);
    console.log(`   Namespace: ${stakeholderNamespace}`);
    console.log(`   Total chunks: ${totalChunks}`);
    console.log(`   Ground Truth: ${uniqueRelevantChunks.length} 件`);

    // ──────────────────────────────────────
    // (A) Adaptive 検索
    // ──────────────────────────────────────
    const adaptiveK = getDynamicK(totalChunks, stakeholder, 'pinecone');
    const adaptiveQueries = generateQueriesForStakeholder(stakeholder);
    const adaptiveWeights = getWeightsForStakeholder(stakeholder, adaptiveQueries.length);

    console.log(`\n   🟢 Adaptive:`);
    console.log(`      K=${adaptiveK}, Queries=${adaptiveQueries.length}, Weights=[${adaptiveWeights.map(w => w.toFixed(1)).join(', ')}]`);

    const adaptiveChunks = await executeRRFSearch(
      openai, pinecone, adaptiveQueries, stakeholderNamespace, indexName,
      adaptiveK, 60, adaptiveWeights
    );

    const adaptiveResult = evaluateQuery(
      `adaptive_${stakeholder.id}`,
      `[Adaptive] ${stakeholder.role}`,
      stakeholder.id,
      adaptiveChunks,
      uniqueRelevantChunks,
      adaptiveK
    );
    adaptiveQueryResults.push(adaptiveResult);
    adaptiveAllChunks.push(adaptiveChunks);
    adaptiveKValues.push(adaptiveK);

    console.log(`      取得: ${adaptiveChunks.length}/${adaptiveK}`);
    console.log(`      P@K: ${(adaptiveResult.metrics.precisionAtK * 100).toFixed(1)}%, R@K: ${(adaptiveResult.metrics.recallAtK * 100).toFixed(1)}%, nDCG: ${adaptiveResult.metrics.ndcgAtK.toFixed(3)}`);

    // ──────────────────────────────────────
    // (B) Non-Adaptive 検索
    // ──────────────────────────────────────
    const nonAdaptiveK = getNonAdaptiveK(totalChunks);
    const nonAdaptiveQueries = generateGenericQueries();
    const nonAdaptiveWeights = Array(nonAdaptiveQueries.length).fill(1.0);

    console.log(`\n   🔴 Non-Adaptive:`);
    console.log(`      K=${nonAdaptiveK} (r_base=${NON_ADAPTIVE_BASE_RATIO}), Queries=${nonAdaptiveQueries.length} (汎用), Weights=[均等]`);

    const nonAdaptiveChunks = await executeRRFSearch(
      openai, pinecone, nonAdaptiveQueries, stakeholderNamespace, indexName,
      nonAdaptiveK, 60, nonAdaptiveWeights
    );

    const nonAdaptiveResult = evaluateQuery(
      `non_adaptive_${stakeholder.id}`,
      `[Non-Adaptive] ${stakeholder.role}`,
      stakeholder.id,
      nonAdaptiveChunks,
      uniqueRelevantChunks,
      nonAdaptiveK
    );
    nonAdaptiveQueryResults.push(nonAdaptiveResult);
    nonAdaptiveAllChunks.push(nonAdaptiveChunks);
    nonAdaptiveKValues.push(nonAdaptiveK);

    console.log(`      取得: ${nonAdaptiveChunks.length}/${nonAdaptiveK}`);
    console.log(`      P@K: ${(nonAdaptiveResult.metrics.precisionAtK * 100).toFixed(1)}%, R@K: ${(nonAdaptiveResult.metrics.recallAtK * 100).toFixed(1)}%, nDCG: ${nonAdaptiveResult.metrics.ndcgAtK.toFixed(3)}`);

    // 比較結果を記録
    comparisonResults.push({
      stakeholderId: stakeholder.id,
      stakeholderRole: stakeholder.role,
      totalChunks,
      adaptive: {
        k: adaptiveK,
        queries: adaptiveQueries,
        weights: adaptiveWeights,
        metrics: adaptiveResult,
        retrievedCount: adaptiveChunks.length,
      },
      nonAdaptive: {
        k: nonAdaptiveK,
        queries: nonAdaptiveQueries,
        weights: nonAdaptiveWeights,
        metrics: nonAdaptiveResult,
        retrievedCount: nonAdaptiveChunks.length,
      },
    });
  }

  if (comparisonResults.length === 0) {
    console.error('❌ エラー: 評価できたステークホルダーがありません。');
    process.exit(1);
  }

  // ──────────────────────────────────────
  // レポート生成
  // ──────────────────────────────────────
  const uniqueFiles = [...new Set(allFiles)];
  const adaptiveAvgK = Math.round(adaptiveKValues.reduce((a, b) => a + b, 0) / adaptiveKValues.length);
  const nonAdaptiveAvgK = Math.round(nonAdaptiveKValues.reduce((a, b) => a + b, 0) / nonAdaptiveKValues.length);

  const adaptiveReport = generateEvaluationReport(
    adaptiveQueryResults, adaptiveAllChunks, uniqueFiles,
    groundTruth.version, adaptiveAvgK, uuid || namespace || 'unknown', adaptiveKValues
  );
  const nonAdaptiveReport = generateEvaluationReport(
    nonAdaptiveQueryResults, nonAdaptiveAllChunks, uniqueFiles,
    groundTruth.version, nonAdaptiveAvgK, uuid || namespace || 'unknown', nonAdaptiveKValues
  );

  // 比較テキストレポート生成
  const comparisonText = formatComparisonReport(comparisonResults, adaptiveReport, nonAdaptiveReport);

  // 結果出力
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const timestampDir = path.join(outputDir, `comparison-${timestamp}`);

  if (!fs.existsSync(timestampDir)) {
    fs.mkdirSync(timestampDir, { recursive: true });
  }

  const comparisonJsonPath = path.join(timestampDir, `comparison-result-${timestamp}.json`);
  const comparisonTextPath = path.join(timestampDir, `comparison-report-${timestamp}.txt`);
  const adaptiveJsonPath = path.join(timestampDir, `adaptive-result-${timestamp}.json`);
  const nonAdaptiveJsonPath = path.join(timestampDir, `non-adaptive-result-${timestamp}.json`);

  const comparisonJson = {
    timestamp: new Date().toISOString(),
    groundTruthVersion: groundTruth.version,
    uuid: uuid || namespace || 'unknown',
    nonAdaptiveConfig: {
      baseRatio: NON_ADAPTIVE_BASE_RATIO,
      genericQueries: generateGenericQueries(),
      uniformWeights: true,
    },
    stakeholderResults: comparisonResults.map(r => ({
      stakeholderId: r.stakeholderId,
      stakeholderRole: r.stakeholderRole,
      totalChunks: r.totalChunks,
      adaptive: {
        k: r.adaptive.k,
        queries: r.adaptive.queries,
        weights: r.adaptive.weights,
        retrievedCount: r.adaptive.retrievedCount,
        metrics: r.adaptive.metrics.metrics,
      },
      nonAdaptive: {
        k: r.nonAdaptive.k,
        queries: r.nonAdaptive.queries,
        weights: r.nonAdaptive.weights,
        retrievedCount: r.nonAdaptive.retrievedCount,
        metrics: r.nonAdaptive.metrics.metrics,
      },
      delta: {
        precisionAtK: r.adaptive.metrics.metrics.precisionAtK - r.nonAdaptive.metrics.metrics.precisionAtK,
        recallAtK: r.adaptive.metrics.metrics.recallAtK - r.nonAdaptive.metrics.metrics.recallAtK,
        f1AtK: r.adaptive.metrics.metrics.f1AtK - r.nonAdaptive.metrics.metrics.f1AtK,
        reciprocalRank: r.adaptive.metrics.metrics.reciprocalRank - r.nonAdaptive.metrics.metrics.reciprocalRank,
        ndcgAtK: r.adaptive.metrics.metrics.ndcgAtK - r.nonAdaptive.metrics.metrics.ndcgAtK,
      },
    })),
  };

  fs.writeFileSync(comparisonJsonPath, JSON.stringify(comparisonJson, null, 2), 'utf-8');
  fs.writeFileSync(comparisonTextPath, comparisonText, 'utf-8');
  fs.writeFileSync(adaptiveJsonPath, JSON.stringify({ ...adaptiveReport, dynamicKValues: adaptiveKValues }, null, 2), 'utf-8');
  fs.writeFileSync(nonAdaptiveJsonPath, JSON.stringify({ ...nonAdaptiveReport, dynamicKValues: nonAdaptiveKValues }, null, 2), 'utf-8');

  console.log(comparisonText);
  console.log(`\n📄 結果ファイル:`);
  console.log(`   比較JSON:          ${comparisonJsonPath}`);
  console.log(`   比較テキスト:      ${comparisonTextPath}`);
  console.log(`   Adaptive JSON:     ${adaptiveJsonPath}`);
  console.log(`   Non-Adaptive JSON: ${nonAdaptiveJsonPath}`);
}

// ============================================================
// 比較レポートフォーマット
// ============================================================

function formatComparisonReport(
  results: StakeholderComparisonResult[],
  adaptiveReport: EvaluationReport,
  nonAdaptiveReport: EvaluationReport
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════════════════╗');
  lines.push('║           Adaptive vs Non-Adaptive RAG 比較レポート                      ║');
  lines.push('╚══════════════════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`評価日時: ${new Date().toISOString()}`);
  lines.push(`Non-Adaptive設定: r_base=${NON_ADAPTIVE_BASE_RATIO} (K=ceil(N×r_base)), 汎用クエリ6本, 均等重み`);
  lines.push('');

  // 各ステークホルダーの比較表
  for (const r of results) {
    const am = r.adaptive.metrics.metrics;
    const nm = r.nonAdaptive.metrics.metrics;

    lines.push(`${'━'.repeat(74)}`);
    lines.push(`■ ${r.stakeholderRole} (${r.stakeholderId})`);
    lines.push(`  総チャンク: ${r.totalChunks}`);
    lines.push('');
    lines.push('  ┌────────────────┬────────────┬────────────────┬──────────┐');
    lines.push('  │ 指標           │ Adaptive   │ Non-Adaptive   │ Δ差分    │');
    lines.push('  ├────────────────┼────────────┼────────────────┼──────────┤');
    lines.push(formatMetricRow('K値', r.adaptive.k, r.nonAdaptive.k, false));
    lines.push(formatMetricRow('取得数', r.adaptive.retrievedCount, r.nonAdaptive.retrievedCount, false));
    lines.push(formatMetricRow('Precision@K', am.precisionAtK, nm.precisionAtK, true));
    lines.push(formatMetricRow('Recall@K', am.recallAtK, nm.recallAtK, true));
    lines.push(formatMetricRow('F1@K', am.f1AtK, nm.f1AtK, true));
    lines.push(formatMetricRow('MRR', am.reciprocalRank, nm.reciprocalRank, true));
    lines.push(formatMetricRow('nDCG@K', am.ndcgAtK, nm.ndcgAtK, true));
    lines.push('  └────────────────┴────────────┴────────────────┴──────────┘');

    // クエリ情報
    lines.push('');
    lines.push('  Adaptive クエリ:');
    r.adaptive.queries.forEach((q, i) => {
      lines.push(`    ${i + 1}. ${q}  (w=${r.adaptive.weights[i].toFixed(1)})`);
    });
    lines.push('');
    lines.push('  Non-Adaptive クエリ (共通):');
    r.nonAdaptive.queries.forEach((q, i) => {
      lines.push(`    ${i + 1}. ${q}  (w=1.0)`);
    });
    lines.push('');
  }

  // 全体サマリー
  lines.push(`${'━'.repeat(74)}`);
  lines.push('■ 全体サマリー');
  lines.push('');

  const avgDelta = (metric: (m: QueryEvaluationResult['metrics']) => number): number => {
    const sum = results.reduce((acc, r) => {
      return acc + (metric(r.adaptive.metrics.metrics) - metric(r.nonAdaptive.metrics.metrics));
    }, 0);
    return sum / results.length;
  };

  const avgAdaptive = (metric: (m: QueryEvaluationResult['metrics']) => number): number => {
    return results.reduce((acc, r) => acc + metric(r.adaptive.metrics.metrics), 0) / results.length;
  };
  const avgNonAdaptive = (metric: (m: QueryEvaluationResult['metrics']) => number): number => {
    return results.reduce((acc, r) => acc + metric(r.nonAdaptive.metrics.metrics), 0) / results.length;
  };

  lines.push('  ┌────────────────┬────────────┬────────────────┬──────────┐');
  lines.push('  │ 指標 (平均)    │ Adaptive   │ Non-Adaptive   │ Δ差分    │');
  lines.push('  ├────────────────┼────────────┼────────────────┼──────────┤');
  lines.push(formatAvgRow('Precision@K', avgAdaptive(m => m.precisionAtK), avgNonAdaptive(m => m.precisionAtK), avgDelta(m => m.precisionAtK)));
  lines.push(formatAvgRow('Recall@K', avgAdaptive(m => m.recallAtK), avgNonAdaptive(m => m.recallAtK), avgDelta(m => m.recallAtK)));
  lines.push(formatAvgRow('F1@K', avgAdaptive(m => m.f1AtK), avgNonAdaptive(m => m.f1AtK), avgDelta(m => m.f1AtK)));
  lines.push(formatAvgRow('MRR', avgAdaptive(m => m.reciprocalRank), avgNonAdaptive(m => m.reciprocalRank), avgDelta(m => m.reciprocalRank)));
  lines.push(formatAvgRow('nDCG@K', avgAdaptive(m => m.ndcgAtK), avgNonAdaptive(m => m.ndcgAtK), avgDelta(m => m.ndcgAtK)));
  lines.push('  └────────────────┴────────────┴────────────────┴──────────┘');
  lines.push('');

  // 結論
  const avgPrecisionDelta = avgDelta(m => m.precisionAtK);
  const avgNdcgDelta = avgDelta(m => m.ndcgAtK);
  lines.push('  結論:');
  if (avgPrecisionDelta > 0 && avgNdcgDelta > 0) {
    lines.push(`    ✅ Adaptive方式はPrecisionを平均 ${(avgPrecisionDelta * 100).toFixed(1)}pp, nDCGを平均 ${avgNdcgDelta.toFixed(3)} 改善`);
  } else if (avgPrecisionDelta > 0) {
    lines.push(`    🟡 Adaptive方式はPrecisionを平均 ${(avgPrecisionDelta * 100).toFixed(1)}pp 改善（nDCGは同等）`);
  } else {
    lines.push(`    ⚠️ Adaptive方式の優位性が限定的。クエリ・重み設計の見直しが必要な可能性`);
  }
  lines.push('');

  return lines.join('\n');
}

function formatMetricRow(label: string, adaptive: number, nonAdaptive: number, isPercent: boolean): string {
  const padLabel = label.padEnd(14);
  let aStr: string, nStr: string, dStr: string;

  if (isPercent) {
    aStr = `${(adaptive * 100).toFixed(1)}%`.padStart(10);
    nStr = `${(nonAdaptive * 100).toFixed(1)}%`.padStart(14);
    const delta = (adaptive - nonAdaptive) * 100;
    const sign = delta >= 0 ? '+' : '';
    dStr = `${sign}${delta.toFixed(1)}pp`.padStart(8);
  } else {
    aStr = `${adaptive}`.padStart(10);
    nStr = `${nonAdaptive}`.padStart(14);
    const delta = adaptive - nonAdaptive;
    const sign = delta >= 0 ? '+' : '';
    dStr = `${sign}${delta}`.padStart(8);
  }

  return `  │ ${padLabel} │${aStr}  │${nStr}  │${dStr}  │`;
}

function formatAvgRow(label: string, adaptive: number, nonAdaptive: number, delta: number): string {
  const padLabel = label.padEnd(14);
  const aStr = `${(adaptive * 100).toFixed(1)}%`.padStart(10);
  const nStr = `${(nonAdaptive * 100).toFixed(1)}%`.padStart(14);
  const sign = delta >= 0 ? '+' : '';
  const dStr = `${sign}${(delta * 100).toFixed(1)}pp`.padStart(8);

  return `  │ ${padLabel} │${aStr}  │${nStr}  │${dStr}  │`;
}

// ============================================================
// CLIエントリーポイント
// ============================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  function getArg(name: string): string | undefined {
    const index = args.indexOf(`--${name}`);
    return index !== -1 ? args[index + 1] : undefined;
  }

  function getArgNumber(name: string, defaultValue: number): number {
    const value = getArg(name);
    return value ? parseInt(value, 10) : defaultValue;
  }

  switch (command) {
    case 'export-csv': {
      const namespace = getArg('namespace');
      const uuid = getArg('uuid');
      const output = getArg('output') || './chunks-for-labeling.csv';
      const stakeholdersFile = getArg('stakeholders');
      const kStr = getArg('k');
      const k = kStr ? parseInt(kStr, 10) : undefined; // undefinedなら動的K値

      if (!namespace && !uuid) {
        console.error('❌ --namespace または --uuid が必要です');
        process.exit(1);
      }

      if (!stakeholdersFile) {
        console.error('❌ --stakeholders（ステークホルダーJSONファイル）が必要です');
        process.exit(1);
      }

      const stakeholders = JSON.parse(fs.readFileSync(stakeholdersFile, 'utf-8'));
      await commandExportTSV(namespace, uuid, stakeholders, output, { k });
      break;
    }

    case 'export-all-csv': {
      const uuid = getArg('uuid');
      const output = getArg('output') || './all-chunks-for-labeling.csv';
      const stakeholdersArg = getArg('stakeholders');
      const priorityFile = getArg('priority') || './rag-priority-mapping.xlsx';

      if (!uuid) {
        console.error('❌ --uuid が必要です');
        process.exit(1);
      }

      // ステークホルダーIDを指定（デフォルトはcxoとtechnical-fellows）
      let stakeholderIds: string[];
      if (stakeholdersArg) {
        // JSONファイルまたはカンマ区切りのID
        if (stakeholdersArg.endsWith('.json')) {
          const stakeholders = JSON.parse(fs.readFileSync(stakeholdersArg, 'utf-8'));
          stakeholderIds = stakeholders.map((s: Stakeholder) => s.id);
        } else {
          stakeholderIds = stakeholdersArg.split(',');
        }
      } else {
        stakeholderIds = ['cxo', 'technical-fellows'];
      }

      // 優先度ファイルの存在確認
      const priorityFilePath = fs.existsSync(priorityFile) ? priorityFile : undefined;
      if (priorityFilePath) {
        console.log(`✅ 優先度ファイルを検出: ${priorityFile}`);
      } else {
        console.log(`⚠️ 優先度ファイルが見つかりません: ${priorityFile}`);
        console.log(`   → relevance列は空で出力されます（手動ラベリング用）`);
      }

      await commandExportAllChunks(uuid, stakeholderIds, output, priorityFilePath);
      break;
    }

    case 'convert-all-csv': {
      const input = getArg('input');
      const output = getArg('output') || './ground-truth-all.json';
      const uuid = getArg('uuid');
      const description = getArg('description') || '';
      const patternStr = getArg('pattern') || '2';
      const pattern = patternStr === '1' ? 1 : 2;

      if (!input) {
        console.error('❌ --input（ラベリング済みCSVファイル）が必要です');
        process.exit(1);
      }

      if (!uuid) {
        console.error('❌ --uuid が必要です');
        process.exit(1);
      }

      commandConvertAllChunks(input, output, uuid, description, pattern);
      break;
    }

    case 'evaluate': {
      const namespace = getArg('namespace');
      const groundTruth = getArg('ground-truth');
      const outputDir = getArg('output') || './evaluation-results';
      const kStr = getArg('k');
      const k = kStr ? parseInt(kStr, 10) : undefined; // undefinedなら動的K値

      if (!namespace || !groundTruth) {
        console.error('❌ --namespace と --ground-truth が必要です');
        process.exit(1);
      }

      await commandEvaluate(namespace, groundTruth, outputDir, { k });
      break;
    }

    case 'evaluate-rrf': {
      const namespace = getArg('namespace');
      const uuid = getArg('uuid');
      const stakeholdersFile = getArg('stakeholders');
      const groundTruth = getArg('ground-truth');
      const outputDir = getArg('output') || './evaluation-results';
      const kStr = getArg('k');
      const k = kStr ? parseInt(kStr, 10) : undefined; // undefinedなら動的K値

      if (!namespace && !uuid) {
        console.error('❌ --namespace または --uuid が必要です');
        process.exit(1);
      }

      if (!stakeholdersFile || !groundTruth) {
        console.error('❌ --stakeholders, --ground-truth が必要です');
        process.exit(1);
      }

      await commandEvaluateRRF(namespace, uuid, stakeholdersFile, groundTruth, outputDir, { k });
      break;
    }

    case 'evaluate-comparison': {
      const namespace = getArg('namespace');
      const uuid = getArg('uuid');
      const stakeholdersFile = getArg('stakeholders');
      const groundTruth = getArg('ground-truth');
      const outputDir = getArg('output') || './evaluation-results';

      if (!namespace && !uuid) {
        console.error('❌ --namespace または --uuid が必要です');
        process.exit(1);
      }

      if (!stakeholdersFile || !groundTruth) {
        console.error('❌ --stakeholders, --ground-truth が必要です');
        process.exit(1);
      }

      await commandEvaluateComparison(namespace, uuid, stakeholdersFile, groundTruth, outputDir);
      break;
    }

    case 'evaluate-ablation': {
      const namespace = getArg('namespace');
      const uuid = getArg('uuid');
      const stakeholdersFile = getArg('stakeholders');
      const groundTruth = getArg('ground-truth');
      const outputDir = getArg('output') || './evaluation-results';

      if (!namespace && !uuid) {
        console.error('❌ --namespace または --uuid が必要です');
        process.exit(1);
      }

      if (!stakeholdersFile || !groundTruth) {
        console.error('❌ --stakeholders, --ground-truth が必要です');
        process.exit(1);
      }

      await commandEvaluateAblation(namespace, uuid, stakeholdersFile, groundTruth, outputDir);
      break;
    }

    case 'convert-csv': {
      const input = getArg('input');
      const output = getArg('output') || './ground-truth.json';
      const description = getArg('description') || '';

      if (!input) {
        console.error('❌ --input（ラベリング済みTSVファイル）が必要です');
        process.exit(1);
      }

      commandConvertTSV(input, output, description);
      break;
    }

    case 'show-queries': {
      const stakeholdersFile = getArg('stakeholders');
      if (!stakeholdersFile) {
        console.error('❌ --stakeholders が必要です');
        process.exit(1);
      }
      commandShowQueries(stakeholdersFile);
      break;
    }

    case 'generate-template': {
      const output = getArg('output') || './ground-truth-template.json';
      commandGenerateTemplate(output);
      break;
    }

    case 'help':
    default:
      console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           RAG 評価スクリプト - SSRツール用                       ║
╚══════════════════════════════════════════════════════════════════╝

使用方法:
  npx ts-node rag-evaluator.ts <command> [options]

コマンド:

  export-csv       検索結果をCSV形式で出力（ラベリング用・部分評価）
    --uuid          <string>  ユーザーUUID（namespace自動生成）
    --namespace     <string>  Pinecone namespace（直接指定する場合）
    --stakeholders  <file>    ステークホルダーJSONファイル（必須）
    --output        <file>    出力CSVファイルパス
    --k             <number>  固定K値（省略時は動的計算）

  export-all-csv   全チャンクをCSV形式で出力（完全評価用・横並びフォーマット）
    --uuid          <string>  ユーザーUUID（必須）
    --stakeholders  <file>    ステークホルダーJSONまたはカンマ区切りID
                              （省略時: cxo,technical-fellows）
    --output        <file>    出力CSVファイルパス

  convert-csv      ラベリング済みCSV/TSVをGround Truth JSONに変換（部分評価用）
    --input         <file>    ラベリング済みCSV/TSVファイル（必須）
    --output        <file>    出力JSONファイル
    --description   <string>  説明文

  convert-all-csv  横並びCSVをGround Truth JSONに変換（完全評価用）
    --input         <file>    ラベリング済みCSVファイル（必須）
    --uuid          <string>  ユーザーUUID（必須）
    --output        <file>    出力JSONファイル
    --pattern       <1|2>     評価パターン（デフォルト: 2）
                              1: スコア1以上（◎○△）を正解 → ノイズ評価
                              2: スコア2以上（◎○）を正解 → 適合性評価
    --description   <string>  説明文

  evaluate         クエリ単位での評価を実行
    --namespace     <string>  Pinecone namespace（必須）
    --ground-truth  <file>    Ground Truth JSONファイル（必須）
    --output        <dir>     出力ディレクトリ
    --k             <number>  固定K値（省略時は動的計算）

  evaluate-rrf     RRF方式で評価（推奨・実際のツールと同じ動作）
    --uuid          <string>  ユーザーUUID（namespace自動生成）
    --namespace     <string>  Pinecone namespace（直接指定する場合）
    --stakeholders  <file>    ステークホルダーJSONファイル（必須）
    --ground-truth  <file>    Ground Truth JSONファイル（必須）
    --output        <dir>     出力ディレクトリ
    --k             <number>  固定K値（省略時は動的計算）

  evaluate-comparison  Adaptive vs Non-Adaptive 比較評価
    --uuid          <string>  ユーザーUUID（namespace自動生成）
    --namespace     <string>  Pinecone namespace（直接指定する場合）
    --stakeholders  <file>    ステークホルダーJSONファイル（必須）
    --ground-truth  <file>    Ground Truth JSONファイル（必須）
    --output        <dir>     出力ディレクトリ
    ※ 同じGround Truthに対して、Adaptive（本番同等）とNon-Adaptive（固定K=20,
       汎用クエリ, 均等重み）の両方を実行し、差分を比較レポートとして出力します。

  evaluate-ablation  クエリ拡張と適応型K値の4条件アブレーション分析
    --uuid          <string>  ユーザーUUID（namespace自動生成）
    --namespace     <string>  Pinecone namespace（直接指定する場合）
    --stakeholders  <file>    ステークホルダーJSONファイル（必須）
    --ground-truth  <file>    Ground Truth JSONファイル（必須）
    --output        <dir>     出力ディレクトリ
    ※ baseline / query-expansion-only / adaptive-k-only / full-system を
       同一Ground Truthに対して実行し、要因別の差分を出力します。

  show-queries     ステークホルダーから生成されるクエリを確認
    --stakeholders  <file>    ステークホルダーJSONファイル（必須）

  generate-template  Ground Truthテンプレートを生成
    --output        <file>    出力JSONファイル

  help             このヘルプを表示

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Namespace形式:
  --uuid を指定すると、各ステークホルダーのnamespaceが自動生成されます:
    {stakeholder_id}_{uuid}
  
  例: --uuid "57949af8-d021-703d-e9bd-6f9307a757d4"
    → cxo_57949af8-d021-703d-e9bd-6f9307a757d4
    → technical-fellows_57949af8-d021-703d-e9bd-6f9307a757d4
    → ...

📊 動的K値計算:
  K = min(50, max(5, totalChunks × 0.3 × roleMultiplier))
  
  roleMultiplier:
    - technical-fellows, architect, r-and-d: 1.2（多め）
    - cxo, business: 0.7（絞る）
    - product: 1.0（バランス）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 評価フロー:

  1. ナレッジベース構築（SSRツール側で各ステークホルダーにPDFをアップロード）
  
  2. CSV出力（手動でCLI実行）
     npx ts-node rag-evaluator.ts export-csv \\
       --uuid <your-uuid> \\
       --stakeholders ./stakeholders.json

  3. Excelでラベリング（relevance_score列に0-3を入力）

  4. Ground Truth JSON変換（手動でCLI実行）
     npx ts-node rag-evaluator.ts convert-csv \\
       --input ./labeled.csv \\
       --output ./ground-truth.json

  5. 評価実行（手動でCLI実行）
     npx ts-node rag-evaluator.ts evaluate-rrf \\
       --uuid <your-uuid> \\
       --stakeholders ./stakeholders.json \\
       --ground-truth ./ground-truth.json

  6. アブレーション分析（手動でCLI実行）
     npx ts-node rag-evaluator.ts evaluate-ablation \\
       --uuid <your-uuid> \\
       --stakeholders ./stakeholders.json \\
       --ground-truth ./ground-truth.json
`);
  }
}

main().catch(console.error);
