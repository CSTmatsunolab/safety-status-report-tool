import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { UploadedFile, AnalysisResult } from '@/types';
import { validateAndNormalizeResult } from '@/lib/ai-analysis';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { files }: { files: UploadedFile[] } = await request.json();
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'ファイルが提供されていません' },
        { status: 400 }
      );
    }
    
    // ファイル内容を結合
    const combinedContent = files.map(f => `
      ファイル名: ${f.name}
      タイプ: ${f.type}
      内容: ${f.content}
    `).join('\n\n---\n\n');

    // Claude APIを使用して分析
    const message = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 4000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: `あなたは安全性レポートの分析専門家です。
以下の文書から以下を抽出してください：
1. 関係するステークホルダーとその役職
2. 各ステークホルダーの主な関心事
3. 主要なトピック
4. リスク要因
5. 推奨事項

結果は必ず以下のJSON形式のみで返してください（他の文章は含めないでください）：
{
  "stakeholders": [
    {
      "id": "unique_id",
      "role": "役職名",
      "concerns": ["関心事1", "関心事2"]
    }
  ],
  "keyTopics": ["トピック1", "トピック2"],
  "risks": ["リスク1", "リスク2"],
  "recommendations": ["推奨事項1", "推奨事項2"]
}

文書内容：
${combinedContent}`
        }
      ]
    });

    // レスポンスからJSONを抽出
    const content = message.content[0].type === 'text' ? message.content[0].text : '';
    
    // JSONを抽出（コードブロックがある場合も考慮）
    let jsonString = content;
    if (content.includes('```json')) {
      const match = content.match(/```json\n([\s\S]*?)\n```/);
      if (match) {
        jsonString = match[1];
      }
    } else if (content.includes('```')) {
      const match = content.match(/```\n([\s\S]*?)\n```/);
      if (match) {
        jsonString = match[1];
      }
    }

    const analysisResult = JSON.parse(jsonString) as AnalysisResult;

    // 結果を検証・正規化
    const validatedResult = validateAndNormalizeResult(analysisResult);
    
    return NextResponse.json(validatedResult);
  } catch (error) {
    console.error('Analysis error:', error);
    
    // デフォルトのレスポンスを返す
    const defaultResult: AnalysisResult = {
      stakeholders: [],
      keyTopics: [],
      risks: [],
      recommendations: []
    };
    
    return NextResponse.json(defaultResult);
  }
}