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

import { CustomStakeholderQueryEnhancer } from './query-enhancer-copy';
import { getDynamicK } from './rag-utils-copy';

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
 */
async function executeRRFSearch(
  openai: OpenAI,
  pinecone: Pinecone,
  queries: string[],
  namespace: string,
  indexName: string,
  topK: number,
  rrfConstant: number = 60
): Promise<RetrievedChunk[]> {
  const documentScores = new Map<string, {
    chunk: RetrievedChunk;
    rrfScore: number;
    queryHits: Set<string>;
  }>();

  for (const query of queries) {
    const results = await executeSearch(openai, pinecone, query, namespace, indexName, topK * 2);

    results.forEach((chunk, rank) => {
      const existing = documentScores.get(chunk.chunkId);
      const rrfContribution = 1 / (rrfConstant + rank + 1);

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
    console.log(`\n🔍 生成されたクエリ (${queries.length}件):`);
    queries.forEach((q, idx) => console.log(`   ${idx + 1}. ${q}`));

    console.log(`\n🔎 RRF検索を実行中...`);
    const retrievedChunks = await executeRRFSearch(
      openai,
      pinecone,
      queries,
      stakeholderNamespace,
      indexName,
      k
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
  description: string = ''
): void {
  console.log('\n📊 横並びCSV → Ground Truth JSON 変換を開始...\n');
  console.log(`📋 UUID: ${uuid}`);
  convertAllChunksCSVToGroundTruth(inputPath, outputPath, uuid, description);
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
    console.log(`🔍 生成クエリ: ${queries.length}件`);

    const retrievedChunks = await executeRRFSearch(
      openai,
      pinecone,
      queries,
      stakeholderNamespace,
      indexName,
      k
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

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(outputDir, `evaluation-rrf-result-${timestamp}.json`);
  const textPath = path.join(outputDir, `evaluation-rrf-report-${timestamp}.txt`);

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

      if (!input) {
        console.error('❌ --input（ラベリング済みCSVファイル）が必要です');
        process.exit(1);
      }

      if (!uuid) {
        console.error('❌ --uuid が必要です');
        process.exit(1);
      }

      commandConvertAllChunks(input, output, uuid, description);
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
`);
  }
}

main().catch(console.error);