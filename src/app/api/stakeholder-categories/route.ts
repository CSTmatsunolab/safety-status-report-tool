// src/app/api/stakeholder-categories/route.ts
// カスタムステークホルダの役職・関心事から、GSNノードヒートマップの関連度の算出に使う要求
// （必要とする情報カテゴリー＋重視する論証レイヤー）をLLMで判定する
// （既定ステークホルダは src/lib/gsn-categories.ts の対応表を使うため、この API は呼ばない）

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  formatCategoryDefinitions,
  formatLayerDefinitions,
  normalizeCategoryIds,
  normalizeLayerIds,
} from '@/lib/gsn-categories';
import { stripCodeFence } from '@/lib/llm-json';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'claude-sonnet-5-5';
const MAX_CONCERNS = 10;
const MAX_FIELD_CHARS = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const systemPrompt = (en: boolean) =>
  en
    ? `You decide, from the reader's role and concerns, which information categories of a safety status report the reader needs and which levels of the safety argument (GSN) they focus on.
Output ONLY the following JSON (no preamble, explanation, or code fences).

{"categoryIds":["hazard-risk","business"],"layers":["top","subgoal"]}

Categories:
${formatCategoryDefinitions('en')}

Argument layers:
${formatLayerDefinitions('en')}

Rules:
- categoryIds: every category the reader's concerns require (usually 2-4)
- layers: the 1-2 layers the reader mainly reads (e.g. executives: top, subgoal / engineers: strategy, evidence)
- Use only the IDs listed above`
    : `あなたは、安全性ステータスレポートの読者の役職と関心事から、その読者が必要とする情報カテゴリーと、安全論証（GSN）のどの階層を重視するかを判定するアシスタントです。
次のJSONのみを出力してください（前置き・説明・コードフェンスは不要）。

{"categoryIds":["hazard-risk","business"],"layers":["top","subgoal"]}

カテゴリー:
${formatCategoryDefinitions('ja')}

論証レイヤー:
${formatLayerDefinitions('ja')}

規則:
- categoryIds: 読者の関心事から必要と判断できるカテゴリーをすべて選ぶ（通常2〜4個）
- layers: 読者が主に読む階層を1〜2個選ぶ（例: 経営層は top・subgoal、技術者は strategy・evidence）
- 上記のIDのみを使う`;

const clip = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text.slice(0, MAX_FIELD_CHARS) : undefined;
};

export async function POST(request: NextRequest) {
  try {
    const {
      stakeholder,
      language = 'ja',
    }: { stakeholder?: { role?: string; concerns?: string[] }; language?: 'ja' | 'en' } = await request.json();
    const en = language === 'en';

    const role = clip(stakeholder?.role);
    const concerns = (stakeholder?.concerns ?? [])
      .map((c) => clip(c))
      .filter((c): c is string => !!c)
      .slice(0, MAX_CONCERNS);
    if (!role && concerns.length === 0) {
      return NextResponse.json(
        { error: en ? 'Stakeholder role or concerns are required.' : 'ステークホルダの役職または関心事が必要です。' },
        { status: 400 }
      );
    }

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: systemPrompt(en),
      messages: [
        {
          role: 'user',
          content: `${en ? 'Role' : '役職'}: ${role ?? '-'}\n${en ? 'Concerns' : '関心事'}:\n${concerns.map((c) => `- ${c}`).join('\n')}`,
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json(
        { error: en ? 'The model declined to assign categories.' : 'カテゴリーの判定が拒否されました。' },
        { status: 502 }
      );
    }

    const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    let categoryIds: string[] | undefined;
    let layers: string[] | undefined;
    try {
      const parsed = JSON.parse(stripCodeFence(text)) as { categoryIds?: unknown; layers?: unknown };
      categoryIds = normalizeCategoryIds(parsed.categoryIds);
      layers = normalizeLayerIds(parsed.layers);
    } catch {
      categoryIds = undefined;
    }

    if (!categoryIds || categoryIds.length === 0) {
      console.error('Failed to parse stakeholder category response:', text.slice(0, 500));
      return NextResponse.json(
        { error: en ? 'Failed to parse the assigned categories.' : 'カテゴリーの判定結果を解析できませんでした。' },
        { status: 502 }
      );
    }

    return NextResponse.json({ categoryIds, layers: layers ?? [] });
  } catch (error) {
    console.error('Stakeholder category assignment failed:', error);
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Anthropic API error (${error.status}): ${error.message}` },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stakeholder category assignment failed' },
      { status: 500 }
    );
  }
}
