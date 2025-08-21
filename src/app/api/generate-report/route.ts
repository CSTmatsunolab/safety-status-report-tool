import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { GenerateReportRequest, Report } from '@/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { files, stakeholder }: { files: UploadedFile[]; stakeholder: Stakeholder } = 
      await request.json();
    
    if (!stakeholder || !files || files.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    console.log('Generating report for:', stakeholder.role);
    console.log('Files count:', files.length);

    // レトリック戦略の決定とレポート生成
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: `あなたは安全性レポートの専門ライターです。
以下の情報に基づいて、${stakeholder.role}向けのSafety Status Report (SSR)を作成してください。

ステークホルダー情報:
- 役職: ${stakeholder.role}
- 主な関心事: ${stakeholder.concerns.join(', ')}

レポートの構成:
1. エグゼクティブサマリー
2. 安全性の現状分析
3. リスク評価と対策
4. 技術的詳細（このステークホルダーに関連する部分のみ）
5. 推奨事項と次のステップ

レポート作成のガイドライン:
- ${stakeholder.role}の視点と関心事に焦点を当てる
- 専門用語は必要に応じて使用するが、明確に説明する
- データと事実に基づいた客観的な分析を提供
- 具体的で実行可能な推奨事項を含める

提供されたドキュメントの内容:
${files.map(f => `
【${f.name}】
${f.content.substring(0, 5000)}${f.content.length > 5000 ? '...(省略)' : ''}
`).join('\n\n')}

上記の情報を基に、${stakeholder.role}向けの包括的なSSRを作成してください。`
        }
      ]
    });

    const reportContent = message.content[0].type === 'text' ? message.content[0].text : '';

    const report: Report = {
      id: Math.random().toString(36).substr(2, 9),
      title: `${stakeholder.role}向け Safety Status Report`,
      stakeholder,
      content: reportContent,
      rhetoricStrategy: determineRhetoricStrategy(stakeholder),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error('Report generation error:', error);
    return NextResponse.json(
      { error: 'Report generation failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function determineRhetoricStrategy(stakeholder: Stakeholder): string {
  const roleMap: { [key: string]: string } = {
    'r-and-d': '技術的詳細重視型',
    'product': '製品価値訴求型',
    'business': 'ビジネスインパクト重視型',
    'architect': 'システム設計重視型',
    'technical-fellows': '技術的卓越性重視型',
    'cxo': '戦略的価値重視型'
  };
  
  return roleMap[stakeholder.id] || 'バランス型';
}