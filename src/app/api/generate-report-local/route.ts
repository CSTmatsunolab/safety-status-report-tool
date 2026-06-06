// src/app/api/generate-report-local/route.ts
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Stakeholder, UploadedFile, ReportStructureTemplate } from '@/types';
import {
  determineAdvancedRhetoricStrategy,
  getRhetoricStrategyDisplayName,
} from '@/lib/rhetoric-strategies';
import { isGSNFile, shouldUseFullText } from '@/lib/full-text-files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_CONTENT_CHARS_PER_FILE = 50000;
const MAX_TOTAL_CONTEXT_CHARS = 150000;

type LocalGenerateRequest = {
  stakeholder: Stakeholder;
  reportStructure: ReportStructureTemplate;
  files?: Array<UploadedFile & {
    useFullText?: boolean;
    isGSN?: boolean;
    s3Key?: string;
    size?: number;
  }>;
  fullTextFileIds?: string[];
  language?: 'ja' | 'en';
  anthropicApiKey?: string;
};

type StreamPayload = {
  type: 'progress' | 'chunk' | 'complete' | 'error';
  status?: string;
  message?: string;
  percent?: number;
  text?: string;
  report?: {
    title: string;
    content: string;
    stakeholder: Stakeholder;
    rhetoricStrategy: string;
    createdAt: string;
  };
  error?: string;
  details?: string;
};

function buildFinalReportStructure(
  baseStructure: ReportStructureTemplate,
  hasGSN: boolean
): string[] {
  if (!hasGSN) return baseStructure.sections;

  const finalSections = [...baseStructure.sections];
  const gsnSections = baseStructure.gsnSections || [];
  if (gsnSections.length === 0) return finalSections;

  finalSections.splice(1, 0, gsnSections[0]);
  if (baseStructure.id === 'technical-detailed' && gsnSections.length > 1) {
    finalSections.splice(4, 0, ...gsnSections.slice(1));
  } else if (gsnSections.length > 1) {
    finalSections.splice(3, 0, ...gsnSections.slice(1));
  }

  return finalSections;
}

function truncateFileContent(content: string): { content: string; truncated: boolean } {
  if (content.length <= MAX_CONTENT_CHARS_PER_FILE) {
    return { content, truncated: false };
  }
  return {
    content: `${content.substring(0, MAX_CONTENT_CHARS_PER_FILE)}\n\n[内容が大きすぎるため省略されました]`,
    truncated: true,
  };
}

function buildLocalContext(
  files: LocalGenerateRequest['files'] = [],
  fullTextFileIds: string[] = [],
  language: 'ja' | 'en'
): { context: string; hasGSN: boolean; sourceCount: number } {
  const sourceParts: string[] = [];
  let hasGSN = false;

  files.forEach((file, index) => {
    const sourceId = `SRC-${String(index + 1).padStart(3, '0')}`;
    const isGSN = isGSNFile(file);
    const useFullText = shouldUseFullText(file, fullTextFileIds);
    hasGSN = hasGSN || isGSN;

    const rawContent = file.content || '';
    const content = rawContent.trim()
      ? truncateFileContent(rawContent).content
      : language === 'en'
        ? '[No inline content is available for this file in local mode.]'
        : '[ローカルモードで利用できる本文がありません]';

    sourceParts.push([
      `=== Source ID: [${sourceId}] | File: ${file.name} | Kind: ${useFullText || isGSN ? 'full-text' : 'local-inline'} | GSN: ${isGSN ? 'true' : 'false'} ===`,
      content,
    ].join('\n\n'));
  });

  let context = sourceParts.join('\n\n---\n\n');
  if (context.length > MAX_TOTAL_CONTEXT_CHARS) {
    context = `${context.substring(0, MAX_TOTAL_CONTEXT_CHARS)}\n\n...(文字数制限により省略)`;
  }

  return { context, hasGSN, sourceCount: sourceParts.length };
}

function buildPrompt(params: {
  stakeholder: Stakeholder;
  sections: string[];
  context: string;
  hasGSN: boolean;
  language: 'ja' | 'en';
}): string {
  const { stakeholder, sections, context, hasGSN, language } = params;
  const sectionList = sections.map((section, index) => `${index + 1}. ${section}`).join('\n');

  if (language === 'en') {
    return `You are a professional safety report writer.

Create a stakeholder-specific Safety Status Report using only the provided sources.

Stakeholder:
- Role: ${stakeholder.role}
- Concerns: ${stakeholder.concerns.join(', ')}

Mandatory rules:
- Every concrete fact, number, date, ID, risk status, test result, and causal statement must cite source IDs like [SRC-001].
- Do not invent missing information. Use [NOT DOCUMENTED] or [TO BE CONFIRMED] when the source is insufficient.
- Preserve the requested section order and do not add unrequested main sections.
- ${hasGSN ? 'Include GSN-aware analysis where the requested sections require it.' : 'Do not invent GSN structure when no GSN source is provided.'}

Report sections:
${sectionList}

Provided sources:
${context}

Write the report in English.`;
  }

  return `あなたは安全性レポートの専門ライターです。

提供された出典だけを使って、ステークホルダー向け Safety Status Report を作成してください。

ステークホルダー:
- 役職: ${stakeholder.role}
- 主な関心事: ${stakeholder.concerns.join(', ')}

必須ルール:
- 具体的な事実、数値、日付、ID、リスク状態、テスト結果、因果関係には [SRC-001] のような出典IDを必ず付けること。
- 不足情報は創作せず、「【文書記載なし】」または「【要確認】」と記載すること。
- 指定されたセクション順を守り、主セクションを勝手に追加しないこと。
- ${hasGSN ? 'GSNが含まれるため、該当セクションではGSN構造を踏まえて分析すること。' : 'GSN出典が無い場合、GSN構造を創作しないこと。'}

レポート構成:
${sectionList}

提供された出典:
${context}

レポート全体を日本語で作成してください。`;
}

function encodeSSE(payload: StreamPayload): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: NextRequest): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: StreamPayload) => {
        controller.enqueue(encoder.encode(encodeSSE(payload)));
      };

      try {
        const body: LocalGenerateRequest = await request.json();
        const {
          stakeholder,
          reportStructure,
          files = [],
          fullTextFileIds = [],
          language = 'ja',
        } = body;
        const requestAnthropicApiKey = typeof body.anthropicApiKey === 'string'
          ? body.anthropicApiKey.trim()
          : '';
        const effectiveAnthropicApiKey = requestAnthropicApiKey || process.env.ANTHROPIC_API_KEY;

        if (!stakeholder || !reportStructure) {
          send({
            type: 'error',
            error: 'Missing required parameters: stakeholder or reportStructure',
          });
          controller.close();
          return;
        }

        if (!effectiveAnthropicApiKey) {
          send({
            type: 'error',
            error: language === 'en'
              ? 'Claude API key is not set. Enter it in the UI or set ANTHROPIC_API_KEY in .env.local.'
              : 'Claude APIキーが設定されていません。画面で入力するか、.env.local に ANTHROPIC_API_KEY を設定してください。',
          });
          controller.close();
          return;
        }

        send({
          type: 'progress',
          status: 'preparing',
          message: language === 'en' ? 'Preparing local context...' : 'ローカルコンテキストを準備中...',
          percent: 20,
        });

        const { context, hasGSN, sourceCount } = buildLocalContext(files, fullTextFileIds, language);
        if (sourceCount === 0) {
          send({
            type: 'error',
            error: language === 'en' ? 'No files were provided.' : 'ファイルが指定されていません。',
          });
          controller.close();
          return;
        }

        const finalSections = buildFinalReportStructure(reportStructure, hasGSN);
        const strategy = determineAdvancedRhetoricStrategy(stakeholder);
        const prompt = buildPrompt({
          stakeholder,
          sections: finalSections,
          context,
          hasGSN,
          language,
        });

        send({
          type: 'progress',
          status: 'generating',
          message: language === 'en' ? 'Generating locally...' : 'ローカル生成中...',
          percent: 60,
        });

        const anthropic = new Anthropic({
          apiKey: effectiveAnthropicApiKey,
        });
        let fullReportContent = '';

        const anthropicStream = anthropic.messages.stream({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
          max_tokens: 12000,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const event of anthropicStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullReportContent += event.delta.text;
            send({
              type: 'chunk',
              text: event.delta.text,
            });
          }
        }

        const title = language === 'ja'
          ? `${stakeholder.role}向け Safety Status Report`
          : `Safety Status Report for ${stakeholder.role}`;

        send({
          type: 'complete',
          status: 'complete',
          message: language === 'en' ? 'Generation complete!' : '生成完了！',
          percent: 100,
          report: {
            title,
            content: fullReportContent,
            stakeholder,
            rhetoricStrategy: getRhetoricStrategyDisplayName(strategy, stakeholder, language),
            createdAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        send({
          type: 'error',
          error: 'Local report generation failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
