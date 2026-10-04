// src/app/api/extract-risks/route.ts
// アップロード文書からリスク一覧（ID・名称・発生確率・影響度・対策状況）をLLMで抽出する
// 結果はリスクヒートマップ（src/lib/risk-heatmap.ts の RiskHeatmapData 形式）として返す

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { UploadedFile } from '@/types';
import { getUploadedFileText } from '@/lib/uploaded-file-text';
import { parseHeatmapBlock } from '@/lib/risk-heatmap';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-5-5';
// Lambda（lambda/src/index.ts の MAX_TOTAL_CONTEXT_CHARS）と同じ上限
const MAX_TOTAL_CONTEXT_CHARS = 150000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT_JA = `あなたは安全性文書からリスク情報を抽出するアシスタントです。
提供された文書に記載されている「リスク」をすべて抽出し、次のJSONのみを出力してください（前置き・説明・コードフェンスは不要）。

{"risks":[{"id":"R-101","name":"リスク名","likelihood":"Medium","impact":"High","status":"対策実施中"}]}

規則:
- 文書に記載されたリスク（リスクID R-xxx 等が付いたもの、またはリスク一覧に記載されたもの）を漏れなく全件列挙する
- ハザード（H-xxx）、安全要件（SR-xxx）、テスト（TR-xxx）、課題などはリスクとして扱わない
- likelihood（発生確率）・impact（影響度）・status（対策状況）は文書の記載値をそのまま転記する（High/Medium/Low、高/中/低、1〜5 など）
- 記載がない項目は null とする。推定・補完は禁止
- 同じリスクが複数の文書に出てくる場合は1件にまとめる
- id が文書に無い場合は null とする`;

const SYSTEM_PROMPT_EN = `You extract risk information from safety documents.
Extract every "risk" documented in the provided documents and output ONLY the following JSON (no preamble, explanation, or code fences).

{"risks":[{"id":"R-101","name":"Risk name","likelihood":"Medium","impact":"High","status":"Mitigation in progress"}]}

Rules:
- List every documented risk (items with a risk ID such as R-xxx, or items in a risk list) without omission
- Do NOT treat hazards (H-xxx), safety requirements (SR-xxx), tests (TR-xxx), or issues as risks
- Copy likelihood, impact, and status exactly as documented (High/Medium/Low, 1-5, etc.)
- Use null for anything not documented. Estimation or filling-in is prohibited
- Merge the same risk appearing in multiple documents into one entry
- Use null for id when the document gives none`;

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json|risk-heatmap)?\s*\n([\s\S]*?)```/);
  if (fenced) return fenced[1];
  // 前後に文章が付いた場合に備え、最初の { から最後の } までを取り出す
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

export async function POST(request: NextRequest) {
  try {
    const { files, language = 'ja' }: { files: UploadedFile[]; language?: 'ja' | 'en' } =
      await request.json();

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const parts: string[] = [];
    for (const file of files) {
      const text = await getUploadedFileText(file);
      if (text.trim()) parts.push(`=== ファイル: ${file.name} ===\n\n${text}`);
    }

    let context = parts.join('\n\n---\n\n');
    const truncated = context.length > MAX_TOTAL_CONTEXT_CHARS;
    if (truncated) context = context.substring(0, MAX_TOTAL_CONTEXT_CHARS);

    if (!context.trim()) {
      return NextResponse.json(
        { error: language === 'en' ? 'No readable document content.' : '読み取れる文書内容がありません。' },
        { status: 400 }
      );
    }

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: language === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_JA,
      messages: [{ role: 'user', content: context }],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json(
        { error: language === 'en' ? 'The model declined to extract risks.' : 'リスク抽出が拒否されました。' },
        { status: 502 }
      );
    }

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    const data = parseHeatmapBlock(stripCodeFence(text));

    if (!data) {
      console.error('Failed to parse risk extraction response:', text.slice(0, 500));
      return NextResponse.json(
        { error: language === 'en' ? 'Failed to parse extracted risks.' : 'リスク抽出結果を解析できませんでした。' },
        { status: 502 }
      );
    }

    return NextResponse.json({ risks: data.risks, truncated });
  } catch (error) {
    console.error('Risk extraction failed:', error);
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Anthropic API error (${error.status}): ${error.message}` },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Risk extraction failed' },
      { status: 500 }
    );
  }
}
