// src/app/api/generate-section/route.ts
// セクション単位でレポートを生成するAPI（コンテキストは事前に取得済み）

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Stakeholder, ReportStructureTemplate } from '@/types';
import { determineAdvancedRhetoricStrategy, getRhetoricStrategyDisplayName } from '@/lib/rhetoric-strategies';
import { generateGSNAnalysisPrompt } from '@/lib/report-prompts';
import { generateGSNAnalysisPromptEN } from '@/lib/report-prompts-en';

// Anthropicクライアント
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// セクションごとのコンテキスト最大文字数
const MAX_CONTEXT_PER_SECTION = 40000;

// ステークホルダーごとの読了時間・文字数設定
interface ReadingConfig {
  totalReadingMinutes: number;  // 全体の目標読了時間（分）
  totalCharacters: number;       // 全体の目標文字数
  sectionCharacters: number;     // セクションあたりの目標文字数
}

function getReadingConfig(stakeholder: Stakeholder, totalSections: number): ReadingConfig {
  // ステークホルダーIDに基づいて読了時間を設定
  const configs: Record<string, { minutes: number; charsPerMinute: number }> = {
    'cxo': { minutes: 5, charsPerMinute: 500 },           // 経営層: 5分、簡潔に
    'business': { minutes: 7, charsPerMinute: 500 },      // 事業部門: 7分
    'product': { minutes: 10, charsPerMinute: 500 },      // 製品部門: 10分
    'technical-fellows': { minutes: 15, charsPerMinute: 600 }, // 技術専門家: 15分、詳細OK
    'architect': { minutes: 15, charsPerMinute: 600 },    // アーキテクト: 15分
    'r-and-d': { minutes: 12, charsPerMinute: 550 },      // 研究開発: 12分
  };

  const config = configs[stakeholder.id] || { minutes: 10, charsPerMinute: 500 };
  const totalCharacters = config.minutes * config.charsPerMinute;
  const sectionCharacters = Math.floor(totalCharacters / totalSections);

  return {
    totalReadingMinutes: config.minutes,
    totalCharacters,
    sectionCharacters,
  };
}

interface GenerateSectionRequest {
  sectionName: string;
  sectionIndex: number;
  totalSections: number;
  allSections: string[];
  previousSectionsContent: Record<string, string>;
  stakeholder: Stakeholder;
  reportStructure: ReportStructureTemplate;
  // 事前に取得したコンテキスト
  preparedContext: string;
  hasGSNFile: boolean;
  language?: 'ja' | 'en';
}

/**
 * セクション名がGSN関連かどうか判定
 */
function isGSNSection(sectionName: string): boolean {
  const gsnKeywords = ['GSN', 'Goal Structuring', 'ゴール構造', '論証構造', 'アシュアランスケース'];
  return gsnKeywords.some(keyword => 
    sectionName.toLowerCase().includes(keyword.toLowerCase())
  );
}

/**
 * セクション生成用のプロンプトを構築
 */
function buildSectionPrompt(
  sectionName: string,
  sectionIndex: number,
  totalSections: number,
  allSections: string[],
  previousSectionsContent: Record<string, string>,
  stakeholder: Stakeholder,
  strategy: string,
  contextContent: string,
  hasGSNFile: boolean,
  language: 'ja' | 'en'
): string {
  const isJapanese = language === 'ja';
  
  // 読了時間・文字数設定を取得
  const readingConfig = getReadingConfig(stakeholder, totalSections);
  
  // 前のセクションの要約（一貫性維持のため）
  const previousSummary = Object.entries(previousSectionsContent)
    .map(([name, content]) => {
      // 各セクションは300文字に制限して渡す（簡潔化）
      const truncated = content.length > 300 
        ? content.substring(0, 300) + '...' 
        : content;
      return `【${name}】\n${truncated}`;
    })
    .join('\n\n');

  // GSNセクションの場合は特別なプロンプトを追加
  const gsnPrompt = isGSNSection(sectionName) && hasGSNFile
    ? (isJapanese ? generateGSNAnalysisPrompt(true) : generateGSNAnalysisPromptEN(true))
    : '';

  if (isJapanese) {
    return `あなたは安全性評価レポート（Safety Status Report: SSR）を作成する専門家です。

## タスク
レポートの「${sectionName}」セクション（${sectionIndex + 1}/${totalSections}）を作成してください。

## 重要: 分量制限
- **レポート全体の目標読了時間: ${readingConfig.totalReadingMinutes}分**
- **レポート全体の目標文字数: 約${readingConfig.totalCharacters.toLocaleString()}文字**
- **このセクションの目標文字数: 約${readingConfig.sectionCharacters.toLocaleString()}文字**
- 忙しい${stakeholder.role}が短時間で要点を把握できるよう、簡潔に記述してください
- 冗長な説明や繰り返しを避け、核心的な情報のみを含めてください

## レポート全体の構成
${allSections.map((s, i) => `${i + 1}. ${s}${s === sectionName ? ' ← 今回作成' : ''}`).join('\n')}

## 対象ステークホルダー
- ロール: ${stakeholder.role}
- 関心事: ${stakeholder.concerns?.join(', ') || 'なし'}

## レトリック戦略
${strategy}

${previousSummary ? `## これまでに作成されたセクション（参考・一貫性を保つこと）
${previousSummary}` : ''}

## 提供された文書の内容
${contextContent}

${gsnPrompt}

## 制約
- **目標文字数（約${readingConfig.sectionCharacters.toLocaleString()}文字）を厳守してください**
- Markdown記法（##、**、*、-等）は一切使用しないでください
- 文体は「である調」で統一してください
- 箇条書きは「・」を使用してください
- このセクションのみを出力してください（見出しは不要）
- 前のセクションとの整合性・一貫性を必ず保ってください
- 提供された文書の内容に基づいて具体的に記述してください
- 前のセクションで言及された内容と矛盾しないようにしてください
- 提供された文書に情報がない場合は、その旨を明記してください
- 冗長な表現を避け、要点を絞って記述してください

「${sectionName}」セクションの内容を出力してください：`;
  } else {
    return `You are an expert in creating Safety Status Reports (SSR).

## Task
Create the "${sectionName}" section (${sectionIndex + 1}/${totalSections}) of the report.

## Important: Length Constraints
- **Target reading time for entire report: ${readingConfig.totalReadingMinutes} minutes**
- **Target character count for entire report: ~${readingConfig.totalCharacters.toLocaleString()} characters**
- **Target character count for this section: ~${readingConfig.sectionCharacters.toLocaleString()} characters**
- Write concisely so busy ${stakeholder.role} can grasp key points quickly
- Avoid redundant explanations and repetition; include only essential information

## Overall Report Structure
${allSections.map((s, i) => `${i + 1}. ${s}${s === sectionName ? ' ← Create now' : ''}`).join('\n')}

## Target Stakeholder
- Role: ${stakeholder.role}
- Concerns: ${stakeholder.concerns?.join(', ') || 'None'}

## Rhetoric Strategy
${strategy}

${previousSummary ? `## Previously Created Sections (Reference - Maintain consistency)
${previousSummary}` : ''}

## Provided Document Content
${contextContent}

${gsnPrompt}

## Constraints
- **Strictly adhere to target character count (~${readingConfig.sectionCharacters.toLocaleString()} characters)**
- Do not use Markdown syntax (##, **, *, - etc.)
- Use formal writing style
- Use bullet points with "•"
- Output only this section (no heading needed)
- Maintain consistency with previous sections
- Write specifically based on provided document content
- Do not contradict information mentioned in previous sections
- If information is not available in provided documents, explicitly state so
- Avoid verbose expressions; focus on key points

Output the content for "${sectionName}" section:`;
  }
}

/**
 * Claude APIでセクションを生成
 */
async function generateSectionWithClaude(prompt: string, stakeholder: Stakeholder, totalSections: number): Promise<string> {
  // ステークホルダーに応じてmax_tokensを調整
  const readingConfig = getReadingConfig(stakeholder, totalSections);
  // 日本語: 1文字 ≈ 2トークン、バッファを含めて計算
  const maxTokens = Math.min(2048, Math.ceil(readingConfig.sectionCharacters * 2.5));
  
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  return content.text;
}

// メインのPOSTハンドラ
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body: GenerateSectionRequest = await request.json();
    
    const {
      sectionName,
      sectionIndex,
      totalSections,
      allSections,
      previousSectionsContent,
      stakeholder,
      preparedContext,
      hasGSNFile = false,
      language = 'ja',
    } = body;

    // バリデーション
    if (!sectionName || !stakeholder) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // コンテキストがない場合はエラー
    if (!preparedContext || preparedContext.trim().length === 0) {
      const errorMessage = language === 'ja'
        ? `セクション「${sectionName}」の生成に必要なコンテキストがありません。`
        : `No context available for generating section "${sectionName}".`;
      
      return NextResponse.json(
        { error: errorMessage, details: 'Empty context provided' },
        { status: 400 }
      );
    }

    console.log(`Generating section ${sectionIndex + 1}/${totalSections}: ${sectionName}`);
    console.log(`Context length: ${preparedContext.length} chars`);
    console.log(`Previous sections count: ${Object.keys(previousSectionsContent || {}).length}`);

    // コンテキストを制限（セクションごとに）
    let contextForSection = preparedContext;
    if (contextForSection.length > MAX_CONTEXT_PER_SECTION) {
      contextForSection = contextForSection.substring(0, MAX_CONTEXT_PER_SECTION);
      console.log(`Context truncated to ${MAX_CONTEXT_PER_SECTION} chars for section`);
    }

    // レトリック戦略の決定
    const strategy = determineAdvancedRhetoricStrategy(stakeholder);
    const strategyName = getRhetoricStrategyDisplayName(strategy, stakeholder, language);

    // プロンプトの構築（前のセクションも含める）
    const prompt = buildSectionPrompt(
      sectionName,
      sectionIndex,
      totalSections,
      allSections,
      previousSectionsContent || {},
      stakeholder,
      strategyName,
      contextForSection,
      hasGSNFile,
      language
    );

    // Claude APIでセクション生成（ステークホルダーに応じた文字数制限付き）
    const sectionContent = await generateSectionWithClaude(prompt, stakeholder, totalSections);

    const duration = Date.now() - startTime;
    console.log(`Section "${sectionName}" generated in ${duration}ms`);

    return NextResponse.json({
      success: true,
      sectionName,
      sectionIndex,
      content: sectionContent,
      duration,
    });

  } catch (error) {
    console.error('Section generation error:', error);
    
    return NextResponse.json(
      {
        error: 'Section generation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// タイムアウト設定
export const maxDuration = 25;