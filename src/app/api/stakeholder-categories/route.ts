// src/app/api/stakeholder-categories/route.ts
// カスタムステークホルダの役職・関心事から、GSNノードヒートマップで必要とする情報カテゴリーをLLMで判定する
// （既定ステークホルダは src/lib/gsn-categories.ts の対応表を使うため、この API は呼ばない）

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { formatCategoryDefinitions, normalizeCategoryIds } from '@/lib/gsn-categories';
import { stripCodeFence } from '@/lib/llm-json';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'claude-sonnet-5-5';
const MAX_CONCERNS = 10;
const MAX_FIELD_CHARS = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const systemPrompt = (en: boolean) =>
  en
    ? `You decide which information categories of a safety status report a reader needs, based on the reader's role and concerns.
Output ONLY the following JSON (no preamble, explanation, or code fences).

{"categoryIds":["goal-status","hazard-risk"]}

Categories:
${formatCategoryDefinitions('en')}

Rules:
- Choose every category the reader's concerns require (usually 2-5)
- Use only the category IDs listed above`
    : `あなたは、安全性ステータスレポートの読者の役職と関心事から、その読者が必要とする情報カテゴリーを判定するアシスタントです。
次のJSONのみを出力してください（前置き・説明・コードフェンスは不要）。

{"categoryIds":["goal-status","hazard-risk"]}

カテゴリー:
${formatCategoryDefinitions('ja')}

規則:
- 読者の関心事から必要と判断できるカテゴリーをすべて選ぶ（通常2〜5個）
- 上記のカテゴリーIDのみを使う`;

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
    try {
      categoryIds = normalizeCategoryIds((JSON.parse(stripCodeFence(text)) as { categoryIds?: unknown }).categoryIds);
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

    return NextResponse.json({ categoryIds });
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
