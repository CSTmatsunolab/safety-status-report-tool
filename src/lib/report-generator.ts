import Anthropic from '@anthropic-ai/sdk';
import { Report, Stakeholder, AnalysisResult, UploadedFile } from '@/types';
import { extractStakeholderSpecificInfo } from './ai-analysis';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ReportGenerationOptions {
  tone?: 'formal' | 'semi-formal' | 'casual';
  length?: 'short' | 'medium' | 'long';
  includeVisuals?: boolean;
  emphasizePoints?: string[];
  language?: 'ja' | 'en';
}

/**
 * レトリック戦略の定義
 */
export enum RhetoricStrategy {
  DATA_DRIVEN = 'データ駆動型説得法',
  EMOTIONAL_APPEAL = '感情訴求型',
  LOGICAL_REASONING = '論理的推論型',
  AUTHORITY_BASED = '権威依拠型',
  PROBLEM_SOLUTION = '問題解決型',
  NARRATIVE = 'ナラティブ型'
}

/**
 * ステークホルダー向けのレポートを生成
 */
export async function generateReport(
  stakeholder: Stakeholder,
  analysisResult: AnalysisResult,
  files: UploadedFile[],
  options: ReportGenerationOptions = {}
): Promise<Report> {
  const {
    tone = 'formal',
    length = 'medium',
    includeVisuals = false,
    emphasizePoints = [],
    language = 'ja'
  } = options;

  // レトリック戦略を決定
  const strategy = determineRhetoricStrategy(stakeholder, analysisResult);
  
  // ステークホルダー固有の情報を抽出
  const stakeholderInfo = await extractStakeholderSpecificInfo(files, stakeholder);
  
  // レポートの構造を決定
  const structure = determineReportStructure(stakeholder, strategy, length);
  
  // レポート内容を生成
  const content = await generateReportContent(
    stakeholder,
    analysisResult,
    stakeholderInfo,
    strategy,
    structure,
    {
      tone,
      emphasizePoints,
      language,
      includeVisuals
    }
  );

  // レポートオブジェクトを作成
  const report: Report = {
    id: generateReportId(),
    title: generateReportTitle(stakeholder, language),
    stakeholder,
    content,
    rhetoricStrategy: strategy,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  return report;
}

/**
 * レトリック戦略の決定
 */
function determineRhetoricStrategy(
  stakeholder: Stakeholder,
  analysisResult: AnalysisResult
): RhetoricStrategy {
  const role = stakeholder.role.toLowerCase();
  const concerns = stakeholder.concerns.join(' ').toLowerCase();
  
  // 役職と関心事に基づいて戦略を決定
  if (role.includes('ceo') || role.includes('社長') || role.includes('取締役')) {
    // 経営層にはデータと問題解決を重視
    return RhetoricStrategy.DATA_DRIVEN;
  } else if (role.includes('技術') || role.includes('エンジニア') || role.includes('開発')) {
    // 技術者には論理的推論を重視
    return RhetoricStrategy.LOGICAL_REASONING;
  } else if (role.includes('営業') || role.includes('マーケティング')) {
    // 営業・マーケティングには感情訴求も含める
    return RhetoricStrategy.EMOTIONAL_APPEAL;
  } else if (concerns.includes('リスク') || concerns.includes('安全')) {
    // リスク管理者には問題解決型
    return RhetoricStrategy.PROBLEM_SOLUTION;
  } else if (role.includes('プロジェクト') || role.includes('pm')) {
    // プロジェクトマネージャーにはナラティブ型
    return RhetoricStrategy.NARRATIVE;
  }
  
  // デフォルトはデータ駆動型
  return RhetoricStrategy.DATA_DRIVEN;
}

/**
 * レポート構造の決定
 */
function determineReportStructure(
  stakeholder: Stakeholder,
  strategy: RhetoricStrategy,
  length: 'short' | 'medium' | 'long'
): string[] {
  const baseStructure = [
    'エグゼクティブサマリー',
    '現状分析',
    'リスク評価',
    '推奨事項',
    '次のステップ'
  ];
  
  // 戦略に応じて構造を調整
  switch (strategy) {
    case RhetoricStrategy.DATA_DRIVEN:
      return [
        'エグゼクティブサマリー',
        'データ概要',
        '分析結果',
        'インサイト',
        '推奨事項',
        '実装計画'
      ];
      
    case RhetoricStrategy.PROBLEM_SOLUTION:
      return [
        'エグゼクティブサマリー',
        '問題の定義',
        '根本原因分析',
        '解決策の提案',
        '実装ロードマップ',
        '期待される成果'
      ];
      
    case RhetoricStrategy.NARRATIVE:
      return [
        'エグゼクティブサマリー',
        'プロジェクトの経緯',
        '現在の状況',
        '主要な課題',
        '提案する方向性',
        'アクションプラン'
      ];
      
    default:
      return baseStructure;
  }
}

/**
 * レポート内容の生成
 */
async function generateReportContent(
  stakeholder: Stakeholder,
  analysisResult: AnalysisResult,
  stakeholderInfo: any,
  strategy: RhetoricStrategy,
  structure: string[],
  options: {
    tone: string;
    emphasizePoints: string[];
    language: string;
    includeVisuals: boolean;
  }
): Promise<string> {
  const systemPrompt = buildReportSystemPrompt(
    stakeholder,
    strategy,
    structure,
    options
  );
  
  const userPrompt = buildReportUserPrompt(
    analysisResult,
    stakeholderInfo,
    options.emphasizePoints
  );

  const message = await anthropic.messages.create({
    model: 'claude-3-opus-20240229',
    max_tokens: options.tone === 'formal' ? 4000 : 3000,
    temperature: 0.7,
    messages: [
      {
        role: 'user',
        content: `${systemPrompt}\n\n${userPrompt}`
      }
    ]
  });

  return message.content[0].type === 'text' ? message.content[0].text : '';
}

/**
 * レポート生成用のシステムプロンプト
 */
function buildReportSystemPrompt(
  stakeholder: Stakeholder,
  strategy: RhetoricStrategy,
  structure: string[],
  options: any
): string {
  const toneMap = {
    formal: 'フォーマルで専門的な',
    'semi-formal': 'セミフォーマルでバランスの取れた',
    casual: 'カジュアルで親しみやすい'
  };

  return `
あなたは安全性管理の専門コンサルタントです。
${stakeholder.role}向けのレポートを作成してください。

レポートの要件：
- 対象読者: ${stakeholder.role}
- 主な関心事: ${stakeholder.concerns.join(', ')}
- レトリック戦略: ${strategy}
- トーン: ${toneMap[options.tone as keyof typeof toneMap]}文体
- 言語: ${options.language === 'ja' ? '日本語' : '英語'}

レポート構造（この順序で作成）：
${structure.map((section, index) => `${index + 1}. ${section}`).join('\n')}

${strategy}の特徴を活かして、説得力のあるレポートを作成してください。

特に重視すべき点：
${getStrategyGuidelines(strategy)}

${options.includeVisuals ? '※ 図表が効果的な箇所では、[図表: 説明]の形式で挿入位置を示してください。' : ''}
`;
}

/**
 * 戦略別のガイドライン
 */
function getStrategyGuidelines(strategy: RhetoricStrategy): string {
  const guidelines: { [key in RhetoricStrategy]: string } = {
    [RhetoricStrategy.DATA_DRIVEN]: `
- 具体的な数値やデータを多用する
- グラフや表で視覚的に示す
- 統計的な根拠を明確にする
- 客観的な事実に基づく論証`,
    
    [RhetoricStrategy.EMOTIONAL_APPEAL]: `
- ステークホルダーの価値観に訴える
- 成功事例やストーリーを活用
- ビジョンや理想を描く
- 共感を呼ぶ表現を使用`,
    
    [RhetoricStrategy.LOGICAL_REASONING]: `
- 論理的な流れを重視
- 因果関係を明確に示す
- 段階的な説明を心がける
- 技術的な正確性を保つ`,
    
    [RhetoricStrategy.AUTHORITY_BASED]: `
- 業界標準や規格を引用
- 専門家の意見を参照
- ベストプラクティスを紹介
- 信頼性の高い情報源を使用`,
    
    [RhetoricStrategy.PROBLEM_SOLUTION]: `
- 問題を明確に定義
- 根本原因を分析
- 実現可能な解決策を提示
- 実装手順を具体的に説明`,
    
    [RhetoricStrategy.NARRATIVE]: `
- ストーリー形式で展開
- 時系列で経緯を説明
- 登場人物と役割を明確化
- 将来のビジョンへつなげる`
  };
  
  return guidelines[strategy];
}

/**
 * レポート生成用のユーザープロンプト
 */
function buildReportUserPrompt(
  analysisResult: AnalysisResult,
  stakeholderInfo: any,
  emphasizePoints: string[]
): string {
  return `
以下の情報を基にレポートを作成してください：

【分析結果】
- 主要トピック: ${analysisResult.keyTopics.join(', ')}
- 識別されたリスク: ${analysisResult.risks.join(', ')}
- 推奨事項: ${analysisResult.recommendations.join(', ')}

【ステークホルダー固有の情報】
- 関連セクション: ${stakeholderInfo.relevantSections?.join(', ') || 'なし'}
- 重要ポイント: ${stakeholderInfo.keyPoints?.join(', ') || 'なし'}
- 懸念事項: ${stakeholderInfo.concerns?.join(', ') || 'なし'}

${emphasizePoints.length > 0 ? `
【特に強調すべき点】
${emphasizePoints.map(point => `- ${point}`).join('\n')}
` : ''}

上記の情報を統合し、指定された構造に従ってレポートを作成してください。
`;
}

/**
 * レポートIDの生成
 */
function generateReportId(): string {
  return `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * レポートタイトルの生成
 */
function generateReportTitle(stakeholder: Stakeholder, language: string): string {
  if (language === 'ja') {
    return `${stakeholder.role}向け安全性ステータスレポート`;
  } else {
    return `Safety Status Report for ${stakeholder.role}`;
  }
}

/**
 * レポートのサマリーを生成
 */
export async function generateReportSummary(
  report: Report,
  maxLength: number = 200
): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-3-opus-20240229',
    max_tokens: Math.ceil(maxLength / 2),
    temperature: 0.5,
    messages: [
      {
        role: 'user',
        content: `以下のレポートを${maxLength}文字以内で要約してください。
重要なポイントと結論を含めてください。

レポート内容：
${report.content}`
      }
    ]
  });

  return message.content[0].type === 'text' ? message.content[0].text : '';
}