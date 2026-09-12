// src/index.ts
// Lambda Function URL handler - ストリーミング版（RRF実装統合）

import { 
  APIGatewayProxyEventV2,
  Context 
} from 'aws-lambda';
import type { Writable } from 'stream';
import Anthropic from '@anthropic-ai/sdk';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';

const pdfParse = require('pdf-parse-new');

import { 
  GenerateReportRequest, 
  Stakeholder,
  ReportStructureTemplate,
} from './types';
import { buildCompleteUserPrompt, generateSystemPrompt } from './lib/report-prompts';
import { buildCompleteUserPromptEN, generateSystemPromptEN } from './lib/report-prompts-en';
import {
  buildRestructurePrompt,
  generateRestructureSystemPrompt,
  buildRestructurePromptEN,
  generateRestructureSystemPromptEN,
} from './lib/restructure-prompts';
import { 
  determineAdvancedRhetoricStrategy, 
  getRhetoricStrategyDisplayName,
} from './lib/rhetoric-strategies';

// RAGモジュールのインポート
import {
  performAdaptiveRRFSearch,
  performGSNSubtreeAwareSearch,
  generateNamespace,
  debugQueryEnhancement
} from './lib/rag';

// GSNモジュールのインポート
import {
  parseGSN,
  extractMandatorySafetyCore,
  formatMandatorySafetyCore,
  getMandatoryCoreSummary,
  generateStakeholderGSNView,
  gsnViewToContextText,
  generateOutlineFromGSNView,
  generateOutlineFromHiCaseView,
  getOutlineNodes,
  buildHiCaseView,
  GSNView,
  HiCaseView,
  MandatorySafetyCore,
} from './lib/gsn';

// ステークホルダー別「必須見出し」（GSN由来アウトラインに欠落する判断材料）
import {
  StakeholderRequiredSection,
  getStakeholderRequiredSections,
  getRequiredSectionQueries,
  getRequiredSectionTitles,
  mapRequiredSectionsToTemplate,
} from './lib/stakeholder-requirements';

// クライアント初期化
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-northeast-1',
});

// 定数
const MAX_CONTENT_CHARS_PER_FILE = 50000;
const MAX_TOTAL_CONTEXT_CHARS = 150000;
// 2パス目（ステークホルダー構成への再構成）の有効化。既定で有効。
// ENABLE_OUTLINE_RESTRUCTURE=false を設定すると1パス目のGSN由来アウトラインのまま出力する。
const ENABLE_OUTLINE_RESTRUCTURE = process.env.ENABLE_OUTLINE_RESTRUCTURE !== 'false';
const DEBUG_LOGGING = process.env.DEBUG_LOGGING;

// 進捗メッセージの型
interface StreamMessage {
  type: 'progress' | 'chunk' | 'complete' | 'error';
  status?: string;
  message?: string;
  percent?: number;
  // 生成フェーズ（draft = GSN由来アウトラインの1パス目 / restructure = 構成再編成の2パス目）
  phase?: 'draft' | 'restructure';
  // true の場合、クライアントは受信済みのストリーミング本文を破棄して以降のチャンクで置き換える
  resetContent?: boolean;
  // チャンク用
  text?: string;
  // 完了用
  report?: {
    title: string;
    content: string;
    stakeholder: Stakeholder;
    rhetoricStrategy: string;
    createdAt: string;
    // 2パス目を実行した場合の1パス目（GSNノード由来アウトライン）の本文
    draftContent?: string;
    outlineSource?: string;
    restructured?: boolean;
  };
  error?: string;
  details?: string;
  totalDuration?: number;
}

/**
 * GSNファイルがある場合にセクションを動的に追加
 */
function buildFinalReportStructure(
  baseStructure: ReportStructureTemplate,
  hasGSN: boolean
): string[] {
  if (!hasGSN) {
    return baseStructure.sections;
  }

  // GSNファイルがある場合、適切な位置にGSNセクションを挿入
  const finalSections = [...baseStructure.sections];
  const gsnSections = baseStructure.gsnSections || [];

  // GSNセクションがない場合はそのまま返す
  if (gsnSections.length === 0) {
    return finalSections;
  }

  // エグゼクティブサマリーの後にGSN概要を挿入
  if (gsnSections.length > 0) {
    finalSections.splice(1, 0, gsnSections[0]);
  }

  // 技術系レポートの場合は詳細分析を中間に挿入
  if (baseStructure.id === 'technical-detailed' && gsnSections.length > 1) {
    finalSections.splice(4, 0, ...gsnSections.slice(1));
  } else if (gsnSections.length > 1) {
    // その他のレポートは分析結果の後に挿入
    finalSections.splice(3, 0, ...gsnSections.slice(1));
  }

  return finalSections;
}

// ストリーミングハンドラーの実装
async function streamHandler(
  event: APIGatewayProxyEventV2,
  responseStream: Writable,
  _context: Context
): Promise<void> {
  const startTime = Date.now();

  // HTTPレスポンスストリームを設定
  const httpResponseStream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });

  // メッセージ送信ヘルパー
  const sendMessage = (data: StreamMessage): void => {
    httpResponseStream.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // リクエストボディのパース
    const body: GenerateReportRequest = JSON.parse(event.body || '{}');
    const { 
      stakeholder, 
      reportStructure, 
      files = [], 
      fullTextFileIds = [],
      language = 'ja',
      userIdentifier = 'anonymous'
    } = body;

    // バリデーション
    if (!stakeholder || !reportStructure) {
      sendMessage({
        type: 'error',
        error: 'Missing required parameters: stakeholder or reportStructure'
      });
      httpResponseStream.end();
      return;
    }
    
    if (DEBUG_LOGGING) {
        console.log('Starting streaming report generation:', {
          stakeholder: stakeholder.id,
          sections: reportStructure.sections.length,
          gsnSections: reportStructure.gsnSections?.length || 0,
          files: files.length,
          language
        });
    }

    // ステップ1: 開始
    sendMessage({
      type: 'progress',
      status: 'starting',
      message: language === 'ja' ? '処理を開始しています...' : 'Starting process...',
      percent: 0
    });

    // ステップ2: RRF検索
    sendMessage({
      type: 'progress',
      status: 'searching',
      message: language === 'ja' ? 'ナレッジベースを検索中...' : 'Searching knowledge base...',
      percent: 10
    });

    const namespace = generateNamespace(stakeholder.id, userIdentifier);
    const indexName = process.env.PINECONE_INDEX_NAME || 'safety-status-report-tool';
    
    // デバッグモードの場合、クエリ拡張をログ出力
    if (DEBUG_LOGGING) {
      debugQueryEnhancement(stakeholder, {
        maxQueries: 5,
        includeEnglish: true,
        includeSynonyms: true,
        includeRoleTerms: true
      });
    }

    // ステップ3: コンテキスト準備
    sendMessage({
      type: 'progress',
      status: 'preparing',
      message: language === 'ja' ? 'コンテキストを準備中...' : 'Preparing context...',
      percent: 30
    });

    const contextParts: string[] = [];
    let hasGSNFile = false;
    let mandatoryCoreText = '';

    // 全文ファイル処理
    const fullTextFiles = files.filter(f =>
      fullTextFileIds.includes(f.name) || f.useFullText
    );

    for (const file of fullTextFiles) {
      let content = file.content;
      if (file.s3Key && (!content || content.length < 100)) {
        content = await getS3FileContent(file.s3Key, file.name);
      }
      if (content) {
        const truncatedContent = content.length > MAX_CONTENT_CHARS_PER_FILE
          ? content.substring(0, MAX_CONTENT_CHARS_PER_FILE) + '\n\n[内容が大きすぎるため省略されました]'
          : content;
        contextParts.push(`=== ファイル: ${file.name} (全文) ===\n\n${truncatedContent}`);
        if (file.isGSN) hasGSNFile = true;
      }
    }

    // ファイル配列からもGSNチェック
    if (!hasGSNFile) {
      hasGSNFile = files.some(f => f.isGSN);
    }

    // ステップ3.5: RAG検索（GSNファイルの有無で方式を切り替え）
    //
    // [hasGSNFile = true の場合] GSN構造を活用した高精度検索（以下の if ブロック）
    //   手順:
    //   (1) GSNファイル群のテキストを収集し、全文ファイル中のGSN記法も補完追加
    //   (2) parseGSN: 生テキスト → GSNグラフ（ノード・エッジの構造体）に変換
    //   (3) extractMandatorySafetyCore: 全ステークホルダー共通の必須安全根拠ノードを抽出
    //   (4) generateStakeholderGSNView: 現在のステークホルダーに関係するサブツリーへ絞り込み
    //   (5) performGSNSubtreeAwareSearch: 絞り込んだサブツリーをクエリ重み付けに活用し
    //       Pinecone から関連文書を検索（標準 RRF より高精度）
    //   (6) gsnViewToContextText: ステークホルダー向けGSNビューをテキスト化して contextParts に追加
    //   ※ エラー時は gsnSearchUsed を false のままにして標準RRFへフォールバック
    //
    // [hasGSNFile = false の場合] 後の if (!gsnSearchUsed) ブロックで標準RRF検索を実行
    let ragContent: string | null = null;
    let gsnSearchUsed = false;
    let gsnView: GSNView | null = null;
    let hicaseView: HiCaseView | null = null;
    // アウトライン生成（Mandatory Safety Coreセクションの要否判定）で使うため外側に保持する
    let mandatoryCoreForOutline: MandatorySafetyCore | null = null;

    // GSN由来アウトラインはGSNノードのみで構成されるため、
    // ステークホルダー固有の判断材料（CxOの経営判断材料等）に対応する見出しが存在しない。
    // その見出しをアウトライン・RAGクエリ・両パスのプロンプトに反映する。
    // GSNがない場合は静的テンプレートが既に判断材料を含むため適用しない。
    const requiredSections: StakeholderRequiredSection[] = hasGSNFile
      ? getStakeholderRequiredSections(stakeholder, language)
      : [];
    const requiredSectionTitles = getRequiredSectionTitles(requiredSections);

    if (hasGSNFile) {
      try {
        // (1) GSNファイルの生テキストを収集
        let gsnRawText = '';
        const gsnFiles = files.filter(f => f.isGSN || f.type === 'gsn');
        for (const gsnFile of gsnFiles) {
          let content = gsnFile.content;
          if (gsnFile.s3Key && (!content || content.length < 100)) {
            content = await getS3FileContent(gsnFile.s3Key, gsnFile.name);
          }
          if (content) gsnRawText += '\n\n' + content;
        }
        // 全文ファイルの中にGSN記法（"GSN" / "[Goal]" / "[Strategy]"）が含まれる場合も追加補完
        for (const part of contextParts) {
          if (part.includes('GSN') || part.includes('[Goal]') || part.includes('[Strategy]')) {
            gsnRawText += '\n\n' + part;
          }
        }

        if (gsnRawText.trim().length > 50) {
          // (2) 生テキスト → GSNグラフ構造に変換
          const parsedGSN = parseGSN(gsnRawText);
          // (3) 全ステークホルダー共通の必須安全根拠ノードを抽出
          const mandatoryCore = extractMandatorySafetyCore(parsedGSN);
          mandatoryCoreForOutline = mandatoryCore;
          // (4) 現在のステークホルダーに関係するサブツリーへ絞り込み
          gsnView = generateStakeholderGSNView(stakeholder.id, parsedGSN, mandatoryCore);

          // hicase: ステークホルダー別のhinode(higoal/histrategy/hievidence) open/closed判定
          // （RAG検索の絞り込み(gsnView)には影響しない。レポートのアウトライン生成にのみ使う）
          hicaseView = buildHiCaseView(parsedGSN, mandatoryCore, stakeholder.id);

          mandatoryCoreText = formatMandatorySafetyCore(mandatoryCore, hicaseView.mandatoryCoreDetail);

          if (DEBUG_LOGGING) {
            console.log('GSN parsed:', {
              totalNodes: parsedGSN.nodes.size,
              selectedNodes: gsnView.selectedNodes.length,
              mandatoryCoreSummary: getMandatoryCoreSummary(mandatoryCore),
            });
          }

          // (5) GSNサブツリーを考慮した高精度RAG検索
          // アウトライン（見出し）になるノードを特定し、全てのノードにクエリを生成させる
          const outlineNodesForSearch = getOutlineNodes(gsnView, stakeholder.id);
          const gsnRagResult = await performGSNSubtreeAwareSearch(
            openai,
            pinecone,
            stakeholder,
            gsnView,
            namespace,
            indexName,
            {
              enableHybridSearch: process.env.ENABLE_HYBRID_SEARCH === 'true',
              debug: DEBUG_LOGGING === 'true',
              outlineNodes: outlineNodesForSearch,
              // ステークホルダー必須見出しの内容（事業影響・リリース判断等）を回収するクエリ
              additionalQueries: getRequiredSectionQueries(requiredSections),
            }
          );

          if (DEBUG_LOGGING) {
            console.log('GSN subtree-aware search completed:', {
              documentsFound: gsnRagResult.documents.length,
              gsnNodesUsed: gsnRagResult.metadata.gsnNodesUsed,
              mandatoryCoreItemsFound: gsnRagResult.metadata.mandatoryCoreItemsFound,
            });
          }

          ragContent = gsnRagResult.content;
          gsnSearchUsed = true;

          // (6) ステークホルダー向けGSNビューをコンテキストに追加
          const gsnViewCtx = gsnViewToContextText(gsnView);
          if (gsnViewCtx) {
            contextParts.push(`=== GSN ステークホルダービュー ===\n\n${gsnViewCtx}`);
          }
        }
      } catch (gsnError) {
        console.warn('GSN-aware search failed, falling back to standard RAG:', gsnError);
      }
    }

    if (!gsnSearchUsed) {
      // 標準RRF検索にフォールバック
      const ragResult = await performAdaptiveRRFSearch(
        openai,
        pinecone,
        stakeholder,
        namespace,
        indexName,
        {
          enableHybridSearch: process.env.ENABLE_HYBRID_SEARCH === 'true',
          debug: DEBUG_LOGGING === 'true'
        }
      );

      if (DEBUG_LOGGING) {
        console.log('RRF Search completed:', {
          documentsFound: ragResult.documents.length,
          dynamicK: ragResult.metadata.dynamicK,
          queriesUsed: ragResult.metadata.queriesUsed.length,
          totalChunks: ragResult.metadata.totalChunks,
          searchDuration: ragResult.metadata.searchDuration,
          hybridEnabled: ragResult.metadata.hybridSearchEnabled,
        });
      }

      ragContent = ragResult.content;
    }

    const ragLabel = gsnSearchUsed ? 'GSN Subtree-Aware RAG抽出内容' : 'RAG抽出内容';
    if (ragContent) {
      contextParts.push(`=== ${ragLabel} ===\n\n${ragContent}`);
    }

    // hasGSNFile = true かつ必須安全根拠が抽出できた場合のみ、
    // そのテキストをコンテキストに追加してAIが参照できるようにする
    if (mandatoryCoreText) {
      contextParts.push(mandatoryCoreText);
    }

    if (contextParts.length === 0) {
      sendMessage({
        type: 'error',
        error: language === 'ja' 
          ? '文書コンテンツがありません。ファイルをアップロードするか、知識ベースを構築してください。'
          : 'No document content available.'
      });
      httpResponseStream.end();
      return;
    }

    let contextContent = contextParts.join('\n\n---\n\n');
    if (contextContent.length > MAX_TOTAL_CONTEXT_CHARS) {
      contextContent = contextContent.substring(0, MAX_TOTAL_CONTEXT_CHARS) + '\n\n...(文字数制限により省略)';
    }

    // ステップ4: プロンプト構築
    sendMessage({
      type: 'progress',
      status: 'building',
      message: language === 'ja' ? 'プロンプトを構築中...' : 'Building prompt...',
      percent: 50
    });

    const strategy = determineAdvancedRhetoricStrategy(stakeholder);

    // hicaseビューが取得できた場合: ステークホルダー別hinode open/closed判定を反映したアウトラインを生成
    // hicase生成に失敗/空だった場合: 従来のフラットなGSNビュー由来アウトラインにフォールバック
    // GSNなし / GSN解析失敗の場合: 固定テンプレートにフォールバック
    let outlineSource: 'hicase' | 'gsn-flat' | 'template' = 'template';
    let finalSections: string[];
    if (hasGSNFile && hicaseView !== null) {
      const hicaseSections = generateOutlineFromHiCaseView(
        hicaseView,
        language,
        mandatoryCoreForOutline ?? undefined,
        requiredSectionTitles
      );
      if (hicaseSections.length > 0) {
        finalSections = hicaseSections;
        outlineSource = 'hicase';
      } else if (gsnView !== null) {
        finalSections = generateOutlineFromGSNView(gsnView, stakeholder.id, language, requiredSectionTitles);
        outlineSource = 'gsn-flat';
      } else {
        finalSections = buildFinalReportStructure(reportStructure, hasGSNFile);
      }
    } else if (hasGSNFile && gsnView !== null) {
      finalSections = generateOutlineFromGSNView(gsnView, stakeholder.id, language, requiredSectionTitles);
      outlineSource = 'gsn-flat';
    } else {
      finalSections = buildFinalReportStructure(reportStructure, hasGSNFile);
    }
    if (DEBUG_LOGGING) {
      console.log('Final sections:', finalSections);
      console.log('Has GSN:', hasGSNFile);
      console.log('Outline source:', outlineSource);
      console.log('Stakeholder required sections:', requiredSectionTitles);
    }
    const promptBuilder = language === 'en' ? buildCompleteUserPromptEN : buildCompleteUserPrompt;
    const promptContent = promptBuilder({
      stakeholder,
      strategy,
      contextContent,
      reportSections: finalSections,
      hasGSN: hasGSNFile,
      structureDescription: reportStructure.description,
      hasMandatoryCore: hasGSNFile && mandatoryCoreText.length > 0,
      // hicaseの圧縮設定をMandatory Coreプロンプトにも反映させる
      // （渡さないとCxO等の 'count' 設定でも詳細表が生成される）
      mandatoryCoreDetail: hicaseView?.mandatoryCoreDetail ?? 'full',
      // アウトライン末尾に追加したステークホルダー必須見出しの記述指針
      requiredSections: outlineSource !== 'template' ? requiredSections : [],
    });

    // ステップ5: Claude APIストリーミング呼び出し
    sendMessage({
      type: 'progress',
      status: 'generating',
      message: language === 'ja' ? 'AIでレポートを生成中...' : 'Generating report with AI...',
      percent: 60
    });

    console.log('Calling Claude API with streaming...');
    console.log('Context length:', contextContent.length, 'chars');

    // Claude APIをストリーミングで呼び出し
    let fullReportContent = '';
    
    const systemPrompt = language === 'en' ? generateSystemPromptEN() : generateSystemPrompt();

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 20000,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: promptContent
        }
      ]
    });

    // ストリーミングでテキストチャンクを受信・送信
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        fullReportContent += text;
        
        // チャンクをクライアントに送信
        sendMessage({
          type: 'chunk',
          phase: 'draft',
          text: text
        });
      }
    }

    // ステップ5.5: アウトライン再構成（2パス目）
    //
    // 1パス目で得られるのはGSNノード（hicase/GSNビュー）由来のアウトラインに沿ったレポート。
    // これをそのままLLMに再入力し、ステークホルダーに設定されたレポート構成
    // （エグゼクティブサマリー／現状分析／リスク評価／推奨事項 ...）へ再編成する。
    //
    // 実行条件: 2パス目が有効 かつ 1パス目のアウトラインがGSN由来（hicase / gsn-flat）であること。
    //   outlineSource === 'template' の場合、既に目標構成で生成済みなので再構成は不要。
    // フォールバック: 2パス目が失敗、または出力が明らかに短い場合は1パス目の本文をそのまま採用する。
    const draftContent = fullReportContent;
    let restructured = false;

    const shouldRestructure =
      ENABLE_OUTLINE_RESTRUCTURE &&
      outlineSource !== 'template' &&
      draftContent.trim().length > 0;

    if (shouldRestructure) {
      // 目標構成はステークホルダーのテンプレートそのもの（見出しを増やさない）。
      // 1パス目で書かせた判断材料は、テンプレート見出しのうち内容的に適切なものへ
      // 割り当てて「その本文に必ず含めること」と指示する。
      // これを省くと、判断材料が「構成外」として2パス目で削除される。
      const targetSections = buildFinalReportStructure(reportStructure, hasGSNFile);
      const requiredPlacements = mapRequiredSectionsToTemplate(targetSections, requiredSections);

      if (targetSections.length === 0) {
        console.warn('Restructure skipped: target structure has no sections');
      } else {
        try {
          sendMessage({
            type: 'progress',
            status: 'restructuring',
            phase: 'restructure',
            // 1パス目のドラフトを破棄して2パス目の出力で置き換えるようクライアントに指示
            resetContent: true,
            message: language === 'ja'
              ? `レポートを${reportStructure.name}の構成に再編成中...`
              : `Restructuring the report into the ${reportStructure.name} outline...`,
            percent: 75
          });

          const restructureSystemPrompt = language === 'en'
            ? generateRestructureSystemPromptEN()
            : generateRestructureSystemPrompt();
          const restructurePromptBuilder = language === 'en'
            ? buildRestructurePromptEN
            : buildRestructurePrompt;

          const restructurePrompt = restructurePromptBuilder({
            draftContent,
            stakeholder,
            targetSections,
            structureName: reportStructure.name,
            structureDescription: reportStructure.description,
            hasMandatoryCore: hasGSNFile && mandatoryCoreText.length > 0,
            // 1パス目と同じ圧縮設定を渡す。渡さないと 'count' 設定の読者でも
            // ドラフト中の機序（原因・試験条件・閾値）が2パス目で素通りする。
            mandatoryCoreDetail: hicaseView?.mandatoryCoreDetail ?? 'full',
            requiredPlacements,
          });

          if (DEBUG_LOGGING) {
            console.log('Restructuring report:', {
              draftLength: draftContent.length,
              targetSections,
              requiredPlacements: requiredPlacements.map(
                p => `${p.sectionTitle} <- ${p.requirements.map(r => r.title).join(', ')}`
              ),
              structureId: reportStructure.id,
            });
          }

          let restructuredContent = '';
          const restructureStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 20000,
            temperature: 0.2,
            system: restructureSystemPrompt,
            messages: [
              {
                role: 'user',
                content: restructurePrompt
              }
            ]
          });

          for await (const event of restructureStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const text = event.delta.text;
              restructuredContent += text;

              sendMessage({
                type: 'chunk',
                phase: 'restructure',
                text: text
              });
            }
          }

          // 極端に短い出力（再構成失敗・打ち切り）はドラフトを採用する
          if (restructuredContent.trim().length >= Math.min(500, draftContent.length * 0.3)) {
            fullReportContent = restructuredContent;
            restructured = true;
          } else {
            console.warn('Restructure output too short, keeping draft:', {
              draftLength: draftContent.length,
              restructuredLength: restructuredContent.length,
            });
            // ドラフトを再送してクライアント側の表示を復元する
            sendMessage({
              type: 'chunk',
              phase: 'restructure',
              resetContent: true,
              text: draftContent
            });
          }
        } catch (restructureError) {
          console.warn('Restructure pass failed, falling back to draft:', restructureError);
          fullReportContent = draftContent;
          // 破棄させたドラフトをクライアント側に復元する
          sendMessage({
            type: 'chunk',
            phase: 'restructure',
            resetContent: true,
            text: draftContent
          });
        }
      }
    }

    // ステップ6: 完了
    sendMessage({
      type: 'progress',
      status: 'finalizing',
      message: language === 'ja' ? 'レポートを仕上げ中...' : 'Finalizing report...',
      percent: 90
    });

    const title = language === 'ja'
      ? `${stakeholder.role}向け Safety Status Report`
      : `Safety Status Report for ${stakeholder.role}`;

    const totalDuration = Date.now() - startTime;

    console.log(`Report generation completed in ${totalDuration}ms`);

    // 最終結果を送信
    sendMessage({
      type: 'complete',
      status: 'complete',
      message: language === 'ja' ? '生成完了！' : 'Generation complete!',
      percent: 100,
      report: {
        title,
        content: fullReportContent,
        stakeholder,
        rhetoricStrategy: getRhetoricStrategyDisplayName(strategy, stakeholder, language),
        createdAt: new Date().toISOString(),
        outlineSource,
        restructured,
        draftContent: restructured ? draftContent : undefined,
      },
      totalDuration,
    });

  } catch (error) {
    console.error('Lambda handler error:', error);
    sendMessage({
      type: 'error',
      error: 'Report generation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    httpResponseStream.end();
  }
}

// ストリーミングLambdaハンドラーをエクスポート
export const handler = awslambda.streamifyResponse(streamHandler);

/**
 * S3からファイルコンテンツを取得
 * XLSX/DOCX/テキストファイルを適切に処理
 */
async function getS3FileContent(key: string, fileName: string): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    const bodyContents = await response.Body?.transformToByteArray();
    
    if (!bodyContents) {
      throw new Error('Failed to get file content from S3');
    }

    const buffer = Buffer.from(bodyContents);
    const lowerFileName = fileName.toLowerCase();

    // Excel ファイル (.xlsx, .xls) の処理
    if (lowerFileName.endsWith('.xlsx') || lowerFileName.endsWith('.xls')) {
      console.log(`Processing Excel file: ${fileName}`);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      let content = '';
      
      workbook.SheetNames.forEach((sheetName, index) => {
        const sheet = workbook.Sheets[sheetName];
        content += `\n=== Sheet ${index + 1}: ${sheetName} ===\n`;
        content += XLSX.utils.sheet_to_txt(sheet);
        content += '\n';
      });
      
      console.log(`Excel file processed: ${workbook.SheetNames.length} sheets, ${content.length} chars`);
      return content;
    }

    // Word ファイル (.docx) の処理
    if (lowerFileName.endsWith('.docx')) {
      console.log(`Processing Word file: ${fileName}`);
      const result = await mammoth.extractRawText({ buffer });
      console.log(`Word file processed: ${result.value.length} chars`);
      return result.value;
    }

    // PDF ファイル (.pdf) の処理
    if (lowerFileName.endsWith('.pdf')) {
      console.log(`Processing PDF file: ${fileName}`);
      const pdfData = await pdfParse(buffer);
      console.log(`PDF file processed: ${pdfData.numpages} pages, ${pdfData.text.length} chars`);
      
      let content = `=== PDF Document: ${fileName} ===\n`;
      content += `(Total pages: ${pdfData.numpages})\n\n`;
      content += pdfData.text;
      return content;
    }

    // その他のファイル（テキストとして処理）
    return new TextDecoder().decode(buffer);
    
  } catch (error) {
    console.error(`Error fetching/processing from S3: ${key}`, error);
    throw error;
  }
}