// src/app/api/extract-risks/route.ts
// アップロード文書からリスク一覧（ID・名称・発生確率・影響度・対策状況）をLLMで抽出する
// 結果はリスクヒートマップ（src/lib/risk-heatmap.ts の RiskHeatmapData 形式）として返す
// GSNファイルが指定されている場合は、GSNノード（達成状況・重大度）も並列に抽出する
// （src/lib/gsn-heatmap.ts の GsnHeatmapData 形式）

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { UploadedFile } from '@/types';
import { getUploadedFileText } from '@/lib/uploaded-file-text';
import { parseHeatmapBlock } from '@/lib/risk-heatmap';
import { GsnHeatmapItem, parseGsnHeatmapBlock } from '@/lib/gsn-heatmap';
import { stripCodeFence } from '@/lib/llm-json';
import { GSN_INFO_CATEGORIES, formatCategoryDefinitions } from '@/lib/gsn-categories';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-5-5';
// Lambda（lambda/src/index.ts の MAX_TOTAL_CONTEXT_CHARS）と同じ上限
const MAX_TOTAL_CONTEXT_CHARS = 150000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// リスクの話題カテゴリー（「ハザード・リスクと対策」は全リスクに当てはまるため除く。src/lib/risk-relevance.ts）
const riskCategoryDefinitions = (language: 'ja' | 'en') =>
  GSN_INFO_CATEGORIES.filter((c) => c.id !== 'hazard-risk')
    .map((c) => `- ${c.id}（${c.label[language]}）: ${c.definition[language]}`)
    .join('\n');

const SYSTEM_PROMPT_JA = `あなたは安全性文書からリスク情報を抽出するアシスタントです。
提供された文書に記載されている「リスク」をすべて抽出し、次のJSONのみを出力してください（前置き・説明・コードフェンスは不要）。

{"risks":[{"id":"R-101","name":"リスク名","likelihood":"Medium","impact":"High","status":"対策実施中","categories":["technology","verification"],"primaryCategory":"technology"}]}

規則:
- 文書に記載されたリスク（リスクID R-xxx 等が付いたもの、またはリスク一覧に記載されたもの）を漏れなく全件列挙する
- ハザード（H-xxx）、安全要件（SR-xxx）、テスト（TR-xxx）、課題などはリスクとして扱わない
- likelihood（発生確率）・impact（影響度）・status（対策状況）は文書の記載値をそのまま転記する（High/Medium/Low、高/中/低、1〜5 など）
- 記載がない項目は null とする。推定・補完は禁止
- 同じリスクが複数の文書に出てくる場合は1件にまとめる
- id が文書に無い場合は null とする
- categories には、リスクの内容・原因・対策・影響について提供文書に記載された事実から説明できる、次の話題カテゴリーのIDを入れる（複数可。定義中の「ノード」は「リスク」と読み替える）。リスクが関連するハザード・要件・試験（H-xxx, SR-xxx, TR-xxx 等）について他の文書に記載された事実（試験不合格、マイルストーン遅延、予算超過、規格準拠の可否 等）も根拠にしてよい。記載のない影響の推測は禁止。該当が無ければ []
- primaryCategory には、categories のうちそのリスクを扱ううえで最も中心となるもの（対策・判断の主な論点）を1つ入れる。categories が [] なら null
${riskCategoryDefinitions('ja')}`;

const SYSTEM_PROMPT_EN = `You extract risk information from safety documents.
Extract every "risk" documented in the provided documents and output ONLY the following JSON (no preamble, explanation, or code fences).

{"risks":[{"id":"R-101","name":"Risk name","likelihood":"Medium","impact":"High","status":"Mitigation in progress","categories":["technology","verification"],"primaryCategory":"technology"}]}

Rules:
- List every documented risk (items with a risk ID such as R-xxx, or items in a risk list) without omission
- Do NOT treat hazards (H-xxx), safety requirements (SR-xxx), tests (TR-xxx), or issues as risks
- Copy likelihood, impact, and status exactly as documented (High/Medium/Low, 1-5, etc.)
- Use null for anything not documented. Estimation or filling-in is prohibited
- Merge the same risk appearing in multiple documents into one entry
- Use null for id when the document gives none
- categories lists the IDs of the following topic categories explainable from facts documented about the risk's content, causes, mitigation, and impact (multiple allowed; read "node" in the definitions as "risk"). Facts documented elsewhere about the hazards, requirements, or tests the risk relates to (H-xxx, SR-xxx, TR-xxx, etc.), such as failed tests, milestone delays, budget overruns, or standard conformance, may also be used. Do not guess impacts that are not documented. Use [] if none
- primaryCategory is the one category in categories that is most central to handling the risk (the main point of its mitigation or decision). null when categories is []
${riskCategoryDefinitions('en')}`;

const GSN_SYSTEM_PROMPT_JA = `あなたはGSN（Goal Structuring Notation）文書からノード情報を抽出するアシスタントです。
提供された文書のうち「=== GSNファイル:」で始まるファイルに記載されたGSNノードを抽出し、次のJSONのみを出力してください（前置き・説明・コードフェンスは不要）。

{"nodes":[{"id":"G1.2","type":"Sub-Goal","text":"識別されたハザードに対策が実施されている","status":"部分達成","severity":"Serious","severitySource":"H-101, H-103 (Serious)","parentIds":["S1"],"categories":["hazard-risk","verification"]}]}

規則:
- ノードはGSNファイルからのみ抽出する。対象は Goal / Sub-Goal / Strategy / Solution(Evidence) / Undeveloped。Context / Assumption / Justification は含めない
- 同じノードが図と表など複数箇所に出てくる場合は1件にまとめる
- id・type・text は文書記載のものを使用する（text は内容の要約ではなく記載文。長い場合は先頭100文字程度）
- status（達成状況）は文書の記載値をそのまま転記する（達成/部分達成/未達成/未展開、Strategyの有効/無効、Solutionの証拠の強度 十分/部分的 など）。記載がなければ null
- severity（重大度）は次の順で決め、文書の記載値をそのまま転記する（推定・補完は禁止）:
  1. ノード自身に重大度・ASIL・安全度水準が記載されていればその値
  2. 無ければ、そのノードの内容・根拠・参照欄が参照するハザード／リスク（H-xxx, R-xxx 等）について、他の提供文書に記載された重大度（Severity）または影響度（Impact）のうち最も高い値
  3. どちらも無ければ null
- severitySource には severity の出典を書く（例: "ノード記載", "H-101, H-103 (Serious)", "R-104 (影響度 High)"）。severity が null なら null
- parentIds には親ノードのID（文書の「親ノード」欄やツリー図の接続から転記）を入れる。トップゴールは []。Context 等の除外したノードのIDは含めない。親が記載から読み取れない場合は推定せず null とする（[] はトップゴール専用）
- categories には、ノードが該当する次の必要情報カテゴリーのIDを入れる（複数可）。ノードの記載内容（内容・達成状況・根拠・参照）に加え、ノードが参照するハザード・リスク・要件・試験（H-xxx, R-xxx, SR-xxx, TR-xxx 等）について他の提供文書に記載された事実（試験の不合格、マイルストーンの遅延、予算超過、リリース判断、規格準拠の可否など）から説明できるカテゴリーを入れる。文書に記載のない影響の推測は禁止。該当が無ければ []
${formatCategoryDefinitions('ja')}
- GSNファイルにノードが無い場合は {"nodes":[]} を出力する`;

const GSN_SYSTEM_PROMPT_EN = `You extract node information from GSN (Goal Structuring Notation) documents.
Extract the GSN nodes written in the files that start with "=== GSN file:" and output ONLY the following JSON (no preamble, explanation, or code fences).

{"nodes":[{"id":"G1.2","type":"Sub-Goal","text":"Identified hazards are mitigated","status":"Partially achieved","severity":"Serious","severitySource":"H-101, H-103 (Serious)","parentIds":["S1"],"categories":["hazard-risk","verification"]}]}

Rules:
- Extract nodes from the GSN files only. Include Goal / Sub-Goal / Strategy / Solution (Evidence) / Undeveloped. Do NOT include Context / Assumption / Justification
- Merge the same node appearing in multiple places (diagram, tables, etc.) into one entry
- Use the documented id, type, and text (the written statement, not a summary; about the first 100 characters if long)
- Copy status exactly as documented (Achieved/Partially achieved/Not achieved/Undeveloped, Strategy valid/invalid, Solution evidence strength sufficient/partial, etc.). Use null if not documented
- Determine severity in this order, copying the documented value as is (estimation or filling-in is prohibited):
  1. The severity / ASIL / integrity level documented for the node itself
  2. Otherwise, the highest documented severity or impact, in the other provided documents, of the hazards/risks (H-xxx, R-xxx, etc.) that the node's content, rationale, or references cite
  3. Otherwise null
- severitySource states where severity came from (e.g. "node", "H-101, H-103 (Serious)", "R-104 (Impact High)"). null when severity is null
- parentIds lists the IDs of the node's parents (copied from a "parent node" column or the connections in the tree diagram). Use [] for the top goal. Do not include IDs of excluded nodes such as Context. If the parent cannot be read from the document, use null without guessing ([] is only for the top goal)
- categories lists the IDs of the following information categories the node belongs to (multiple allowed). Include categories explainable from the node's documented content (statement, status, rationale, references) and from facts documented elsewhere in the provided documents about the hazards, risks, requirements, or tests the node cites (H-xxx, R-xxx, SR-xxx, TR-xxx, etc.), such as failed tests, milestone delays, budget overruns, release decisions, or standard conformance. Do not guess impacts that are not documented. Use [] if none
${formatCategoryDefinitions('en')}
- Output {"nodes":[]} if the GSN files contain no nodes`;

const isGSNFile = (file: UploadedFile) => file.type === 'gsn' || !!file.metadata?.userDesignatedGSN;

/**
 * GSNノード（達成状況・重大度）を抽出する。失敗時は例外を投げずに error を返す
 */
async function extractGsnNodes(
  context: string,
  en: boolean
): Promise<{ nodes: GsnHeatmapItem[] | null; error: string | null }> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: en ? GSN_SYSTEM_PROMPT_EN : GSN_SYSTEM_PROMPT_JA,
      messages: [{ role: 'user', content: context }],
    });
    if (response.stop_reason === 'refusal') {
      return { nodes: null, error: en ? 'The model declined to extract GSN nodes.' : 'GSNノード抽出が拒否されました。' };
    }
    const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    const data = parseGsnHeatmapBlock(stripCodeFence(text));
    if (!data) {
      console.error('Failed to parse GSN extraction response:', text.slice(0, 500));
      return { nodes: null, error: en ? 'Failed to parse extracted GSN nodes.' : 'GSNノード抽出結果を解析できませんでした。' };
    }
    return { nodes: data.nodes, error: null };
  } catch (error) {
    console.error('GSN extraction failed:', error);
    return { nodes: null, error: error instanceof Error ? error.message : 'GSN extraction failed' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { files, language = 'ja' }: { files: UploadedFile[]; language?: 'ja' | 'en' } =
      await request.json();

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const en = language === 'en';
    // GSNノードの重大度は他文書（ハザード・リスク）を参照するため全文書を渡す。
    // GSNファイルは打ち切られないよう先頭に置き、見出しで区別する
    const hasGSN = files.some(isGSNFile);
    const ordered = [...files.filter(isGSNFile), ...files.filter((f) => !isGSNFile(f))];
    const parts: string[] = [];
    for (const file of ordered) {
      const text = await getUploadedFileText(file);
      if (!text.trim()) continue;
      const label = isGSNFile(file) ? (en ? 'GSN file' : 'GSNファイル') : en ? 'File' : 'ファイル';
      parts.push(`=== ${label}: ${file.name} ===\n\n${text}`);
    }

    let context = parts.join('\n\n---\n\n');
    const truncated = context.length > MAX_TOTAL_CONTEXT_CHARS;
    if (truncated) context = context.substring(0, MAX_TOTAL_CONTEXT_CHARS);

    if (!context.trim()) {
      return NextResponse.json(
        { error: en ? 'No readable document content.' : '読み取れる文書内容がありません。' },
        { status: 400 }
      );
    }

    // GSN抽出の失敗はリスク抽出の結果を妨げない（gsnError として返す）
    const [response, gsn] = await Promise.all([
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: en ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_JA,
        messages: [{ role: 'user', content: context }],
      }),
      hasGSN ? extractGsnNodes(context, en) : Promise.resolve(null),
    ]);

    if (response.stop_reason === 'refusal') {
      return NextResponse.json(
        { error: en ? 'The model declined to extract risks.' : 'リスク抽出が拒否されました。' },
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
        { error: en ? 'Failed to parse extracted risks.' : 'リスク抽出結果を解析できませんでした。' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      risks: data.risks,
      gsnNodes: gsn?.nodes ?? null,
      gsnError: gsn?.error ?? null,
      truncated,
    });
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
