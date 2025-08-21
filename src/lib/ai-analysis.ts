import Anthropic from '@anthropic-ai/sdk';
import { UploadedFile, AnalysisResult, Stakeholder } from '@/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface AnalysisOptions {
  language?: 'ja' | 'en';
  maxStakeholders?: number;
  focusAreas?: string[];
}

/**
 * ファイル内容を分析し、ステークホルダーと主要情報を抽出
 */
export async function analyzeDocuments(
  files: UploadedFile[],
  options: AnalysisOptions = {}
): Promise<AnalysisResult> {
  const {
    language = 'ja',
    maxStakeholders = 10,
    focusAreas = []
  } = options;

  try {
    // ファイル内容を前処理
    const processedContent = preprocessFiles(files);
    
    // プロンプトを構築
    const systemPrompt = buildSystemPrompt(language, focusAreas);
    const userPrompt = buildUserPrompt(processedContent, maxStakeholders);

    // OpenAI APIを呼び出し
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    // レスポンスをパース
    const result = JSON.parse(
      completion.choices[0].message.content || '{}'
    ) as AnalysisResult;

    // 結果を検証・正規化
    return validateAndNormalizeResult(result);
  } catch (error) {
    console.error('Document analysis error:', error);
    throw new Error('ドキュメント分析に失敗しました');
  }
}

/**
 * ファイル内容の前処理
 */
function preprocessFiles(files: UploadedFile[]): string {
  return files.map(file => {
    let content = file.content;
    
    // GSNファイルの特別な処理
    if (file.type === 'gsn') {
      content = processGSNFile(content);
    }
    
    // 議事録の特別な処理
    if (file.type === 'minutes') {
      content = processMinutesFile(content);
    }
    
    return `
=== ファイル: ${file.name} (${file.type}) ===
${content}
`;
  }).join('\n\n');
}

/**
 * GSNファイルの処理
 */
function processGSNFile(content: string): string {
  // GSN要素を識別しやすい形式に変換
  const processed = content
    .replace(/Goal:/gi, '\n【ゴール】')
    .replace(/Strategy:/gi, '\n【戦略】')
    .replace(/Solution:/gi, '\n【ソリューション】')
    .replace(/Context:/gi, '\n【コンテキスト】')
    .replace(/Justification:/gi, '\n【正当化】');
  
  return processed;
}

/**
 * 議事録ファイルの処理
 */
function processMinutesFile(content: string): string {
  // 議事録から重要な情報を抽出しやすくする
  const processed = content
    .replace(/参加者:|出席者:/gi, '\n【参加者】')
    .replace(/議題:|アジェンダ:/gi, '\n【議題】')
    .replace(/決定事項:/gi, '\n【決定事項】')
    .replace(/アクションアイテム:|TODO:/gi, '\n【アクションアイテム】')
    .replace(/次回:/gi, '\n【次回予定】');
  
  return processed;
}

/**
 * システムプロンプトの構築
 */
function buildSystemPrompt(language: string, focusAreas: string[]): string {
  const focusAreaText = focusAreas.length > 0 
    ? `特に以下の分野に注目してください: ${focusAreas.join(', ')}` 
    : '';

  return `
あなたは安全性管理の専門家であり、技術文書の分析に精通しています。
提供された文書（GSNファイル、議事録など）を分析し、以下の情報を抽出してください：

1. ステークホルダー（関係者）の識別
   - 文書に登場する人物、役職、組織
   - それぞれの役割と責任範囲
   - 各ステークホルダーの主な関心事や懸念事項

2. 主要トピックの抽出
   - 議論されている主な話題
   - 重要な技術的課題
   - プロジェクトの目標や成果物

3. リスク要因の識別
   - 明示的または暗示的に言及されているリスク
   - 潜在的な問題点
   - 注意が必要な領域

4. 推奨事項の生成
   - 文書から導き出される改善提案
   - 次のステップとして考えられる行動
   - 注意すべきポイント

${focusAreaText}

分析は${language === 'ja' ? '日本語' : '英語'}で行い、
実務的で具体的な内容を心がけてください。
`;
}

/**
 * ユーザープロンプトの構築
 */
function buildUserPrompt(content: string, maxStakeholders: number): string {
  return `
以下の文書を分析し、JSON形式で結果を返してください。
最大${maxStakeholders}人のステークホルダーを識別してください。

文書内容：
${content}

必ず以下のJSON構造で返答してください：
{
  "stakeholders": [
    {
      "id": "一意のID",
      "role": "役職・立場",
      "concerns": ["関心事1", "関心事2", ...]
    }
  ],
  "keyTopics": ["主要トピック1", "主要トピック2", ...],
  "risks": ["リスク1", "リスク2", ...],
  "recommendations": ["推奨事項1", "推奨事項2", ...]
}
`;
}

/**
 * 結果の検証と正規化
 */
export function validateAndNormalizeResult(result: any): AnalysisResult {
  // ステークホルダーの正規化
  const stakeholders: Stakeholder[] = (result.stakeholders || []).map((s: any, index: number) => ({
    id: s.id || `stakeholder-${index}`,
    role: s.role || '不明な役職',
    concerns: Array.isArray(s.concerns) ? s.concerns : []
  }));

  // その他のフィールドの正規化
  return {
    stakeholders,
    keyTopics: Array.isArray(result.keyTopics) ? result.keyTopics : [],
    risks: Array.isArray(result.risks) ? result.risks : [],
    recommendations: Array.isArray(result.recommendations) ? result.recommendations : []
  };
}

/**
 * 特定のステークホルダーに関連する情報を抽出
 */
export async function extractStakeholderSpecificInfo(
  files: UploadedFile[],
  stakeholder: Stakeholder
): Promise<{
  relevantSections: string[];
  keyPoints: string[];
  concerns: string[];
}> {
  const content = preprocessFiles(files);
  
  const message = await anthropic.messages.create({
    model: 'claude-3-opus-20240229',
    max_tokens: 2000,
    temperature: 0.7,
    messages: [
      {
        role: 'user',
        content: `${stakeholder.role}の視点から文書を分析し、
この役職に特に関連する情報を抽出してください。

文書内容: ${content}

以下の形式でJSONを返してください:
{
  "relevantSections": ["関連セクション1", "関連セクション2"],
  "keyPoints": ["重要ポイント1", "重要ポイント2"],
  "concerns": ["懸念事項1", "懸念事項2"]
}`
      }
    ]
  });

  const responseContent = message.content[0].type === 'text' ? message.content[0].text : '';
  let jsonString = responseContent;
  if (responseContent.includes('```json')) {
    const match = responseContent.match(/```json\n([\s\S]*?)\n```/);
    if (match) {
      jsonString = match[1];
    }
  }

  return JSON.parse(jsonString);
}