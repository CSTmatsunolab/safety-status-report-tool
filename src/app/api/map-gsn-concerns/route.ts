// src/app/api/map-gsn-concerns/route.ts
// 抽出済みのGSNノードと、ステークホルダの関心事（Stakeholder.concerns）の対応をLLMで判定する
// 結果は src/lib/gsn-concerns.ts の GsnConcernMap 形式で返す

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { GsnHeatmapItem } from '@/lib/gsn-heatmap';
import { parseConcernMappings } from '@/lib/gsn-concerns';
import { stripCodeFence } from '@/lib/llm-json';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-5-5';
const MAX_NODES = 200;
const MAX_CONCERNS = 10;
const MAX_FIELD_CHARS = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT_JA = `あなたは安全性論証（GSN）のノードと、レポート読者の関心事の対応を判定するアシスタントです。
各GSNノードの記載内容（内容・達成状況・重大度とその出典）から、そのノードが読者のどの関心事に関係するかを判定し、次のJSONのみを出力してください（前置き・説明・コードフェンスは不要）。

{"mappings":[{"id":"G1.2","concerns":[0,2],"relevance":"high","reason":"未対策のハザードが残っており、リスク管理上の判断材料になる"}]}

規則:
- concerns には関係する関心事の番号（入力の関心事一覧の番号、0始まり）を入れる
- 関係が**ノードの記載内容から説明できる場合のみ**出力する。関係の無いノードは出力しない
- relevance: そのノードの状況が関心事に直接影響する（判断・説明・対応が必要になる）なら "high"、間接的・背景的な関係なら "medium"
- reason は1文で、ノードの記載内容に根拠を置く。記載に無い事実・原因・影響の推測は禁止
- id は入力のノードIDをそのまま使う`;

const SYSTEM_PROMPT_EN = `You decide how nodes of a safety argument (GSN) relate to the concerns of a report reader.
From each GSN node's documented content (statement, status, severity and its source), decide which of the reader's concerns the node relates to, and output ONLY the following JSON (no preamble, explanation, or code fences).

{"mappings":[{"id":"G1.2","concerns":[0,2],"relevance":"high","reason":"Unmitigated hazards remain, which informs risk management decisions"}]}

Rules:
- concerns lists the numbers of the related concerns (0-based numbers from the input concern list)
- Output a node ONLY when the relation can be explained from the node's documented content. Omit unrelated nodes
- relevance: "high" when the node's state directly affects the concern (requires a decision, explanation, or action); "medium" when the relation is indirect or background
- reason is one sentence grounded in the node's documented content. Do not guess facts, causes, or impacts that are not documented
- Use the node IDs exactly as given`;

interface MapRequest {
  nodes: GsnHeatmapItem[];
  stakeholder: { id: string; role: string; concerns: string[] };
  language?: 'ja' | 'en';
}

const clip = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text.slice(0, MAX_FIELD_CHARS) : undefined;
};

export async function POST(request: NextRequest) {
  try {
    const { nodes, stakeholder, language = 'ja' }: MapRequest = await request.json();
    const en = language === 'en';

    const concerns = (stakeholder?.concerns ?? [])
      .map((c) => clip(c))
      .filter((c): c is string => !!c)
      .slice(0, MAX_CONCERNS);
    if (!Array.isArray(nodes) || nodes.length === 0 || concerns.length === 0) {
      return NextResponse.json(
        { error: en ? 'GSN nodes and stakeholder concerns are required.' : 'GSNノードとステークホルダの関心事が必要です。' },
        { status: 400 }
      );
    }

    const inputNodes = nodes.slice(0, MAX_NODES).map((n) => ({
      id: clip(n.id),
      type: clip(n.type),
      text: clip(n.text),
      status: clip(n.rawStatus),
      severity: clip(n.rawSeverity),
      severitySource: clip(n.severitySource),
    }));

    const userContent = `${en ? 'Reader' : '読者'}: ${clip(stakeholder.role) ?? stakeholder.id}

${en ? 'Concerns' : '関心事'}:
${concerns.map((c, i) => `${i}: ${c}`).join('\n')}

${en ? 'GSN nodes' : 'GSNノード'}:
${JSON.stringify(inputNodes)}`;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: en ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_JA,
      messages: [{ role: 'user', content: userContent }],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json(
        { error: en ? 'The model declined to map concerns.' : '関心事の対応付けが拒否されました。' },
        { status: 502 }
      );
    }

    const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    const mappings = parseConcernMappings(
      stripCodeFence(text),
      inputNodes.map((n) => n.id ?? ''),
      concerns.length
    );

    if (!mappings) {
      console.error('Failed to parse concern mapping response:', text.slice(0, 500));
      return NextResponse.json(
        { error: en ? 'Failed to parse concern mappings.' : '関心事の対応付け結果を解析できませんでした。' },
        { status: 502 }
      );
    }

    return NextResponse.json({ mappings });
  } catch (error) {
    console.error('Concern mapping failed:', error);
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Anthropic API error (${error.status}): ${error.message}` },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Concern mapping failed' },
      { status: 500 }
    );
  }
}
