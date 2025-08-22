import { NextRequest, NextResponse } from 'next/server';
import { Report } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { report }: { report: Report } = await request.json();

    // HTMLコンテンツを生成
    const htmlContent = generateHTMLContent(report);
    
    // HTMLファイルとして返す
    return new Response(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(report.title)}.html"`,
      },
    });
  } catch (error) {
    console.error('HTML export error:', error);
    return NextResponse.json(
      { error: 'HTML export failed' },
      { status: 500 }
    );
  }
}

function generateHTMLContent(report: Report): string {
  const formatDate = (date: Date) => {
    const d = new Date(date);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${d.getMinutes()}`;
  };

  const escapeHtml = (text: string): string => {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  };

  // コンテンツをパラグラフに分割してフォーマット
  const formatContent = (content: string): string => {
    return content.split('\n').map(line => {
      if (line.trim() === '') return '<br>';
      if (line.match(/^\d+\.\s/)) {
        return `<h3>${escapeHtml(line)}</h3>`;
      }
      return `<p>${escapeHtml(line)}</p>`;
    }).join('\n');
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(report.title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', sans-serif;
      line-height: 1.8;
      color: #333;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      background-color: #f5f5f5;
    }
    
    .container {
      background-color: white;
      padding: 60px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    
    h1 {
      font-size: 28px;
      color: #1a1a1a;
      margin-bottom: 10px;
      padding-bottom: 20px;
      border-bottom: 3px solid #0066cc;
    }
    
    .metadata {
      color: #666;
      font-size: 14px;
      margin-bottom: 40px;
      padding: 15px;
      background-color: #f8f9fa;
      border-radius: 4px;
    }
    
    .metadata p {
      margin: 5px 0;
    }
    
    .content {
      margin-top: 30px;
    }
    
    .content h3 {
      font-size: 20px;
      color: #0066cc;
      margin: 30px 0 15px;
      font-weight: 600;
    }
    
    .content p {
      margin-bottom: 15px;
      text-align: justify;
    }
    
    @media print {
      body {
        background-color: white;
        padding: 0;
      }
      .container {
        box-shadow: none;
        padding: 20px;
      }
    }
    
    @media (max-width: 768px) {
      .container {
        padding: 30px 20px;
      }
      h1 {
        font-size: 24px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(report.title)}</h1>
    
    <div class="metadata">
      <p><strong>対象:</strong> ${escapeHtml(report.stakeholder.role)}</p>
      <p><strong>戦略:</strong> ${escapeHtml(report.rhetoricStrategy)}</p>
      <p><strong>作成日:</strong> ${formatDate(report.createdAt)}</p>
      <p><strong>更新日:</strong> ${formatDate(report.updatedAt)}</p>
    </div>
    
    <div class="content">
      ${formatContent(report.content)}
    </div>
  </div>
</body>
</html>`;
}