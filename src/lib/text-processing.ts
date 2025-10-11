// src/lib/text-processing.ts
import { GSN_CONFIG } from '@/lib/config/constants';

//GSNテキストを処理して構造を認識しやすくする
export function processGSNText(text: string): string {
  // GSN要素のパターンを定義（大文字小文字を考慮）
  const patterns = [
    { regex: /\b([Gg]\d+)[:\s：]*/g, label: 'Goal' },
    { regex: /\b([Ss]\d+)[:\s：]*/g, label: 'Strategy' },
    { regex: /\b([Cc]\d+)[:\s：]*/g, label: 'Context' },
    { regex: /\b(Sn\d+)[:\s：]*/g, label: 'Solution' },
    { regex: /\b([Jj]\d+)[:\s：]*/g, label: 'Justification' },
    { regex: /\b([Ee]\d+)[:\s：]*/g, label: 'Evidence' },
    { regex: /\b([Aa]\d+)[:\s：]*/g, label: 'Assumption' },
    { regex: /\b([Mm]\d+)[:\s：]*/g, label: 'Module' },
  ];
  
  let processedText = text;
  
  // 自動フォーマットが有効な場合のみ処理
  if (GSN_CONFIG.enableAutoFormatting) {
    // 各パターンに対して処理
    patterns.forEach(({ regex, label }) => {
      processedText = processedText.replace(regex, (match, id) => {
        return `\n[${label} ${id.toUpperCase()}]: `;
      });
    });
    
    // 接続関係を明確化（矢印の前後に適切な空白を入れる）
    processedText = processedText.replace(/→\s*/g, '\n→ ');
    processedText = processedText.replace(/\s*→/g, ' →');
    
    // 連続する空白行を処理
    if (!GSN_CONFIG.preserveOriginalSpacing) {
      processedText = processedText.replace(/\n\s*\n\s*\n/g, '\n\n');
    }
    
    // GSN要素間の関係を整理（"を子どもノードに持ちます"などのパターン）
    processedText = processedText.replace(
      /([A-Za-z]+\d+)を子どもノードに持ちます/g,
      '→ $1'
    );
    
    // リスト形式の接続関係を整形（例: "G2とG3とC1を..."）
    processedText = processedText.replace(
      /([A-Za-z]+\d+)と([A-Za-z]+\d+)(?:と([A-Za-z]+\d+))?/g,
      (match, ...ids) => {
        const validIds = ids.filter(id => id && typeof id === 'string');
        return '→ ' + validIds.join(', ');
      }
    );
  }
  return processedText.trim();
}

//GSN構造を解析してツリー形式に変換する
export interface GSNNode {
  id: string;
  type: 'Goal' | 'Strategy' | 'Context' | 'Solution' | 'Evidence' | 'Justification' | 'Assumption' | 'Module';
  content: string;
  children: string[];
  isUndeveloped?: boolean;
}

export function parseGSNStructure(text: string): GSNNode[] {
  const nodes: GSNNode[] = [];
  const lines = text.split('\n');
  
  let currentNode: GSNNode | null = null;
  
  for (const line of lines) {
    // ノードの識別パターン
    const nodeMatch = line.match(/\[(\w+)\s+([A-Z]+\d+)\]:\s*(.+)/);
    if (nodeMatch) {
      const [, type, id, content] = nodeMatch;
      currentNode = {
        id,
        type: type as GSNNode['type'],
        content: content.trim(),
        children: []
      };
      nodes.push(currentNode);
    }
    
    // 接続関係の識別
    const connectionMatch = line.match(/→\s*([A-Z]+\d+(?:,\s*[A-Z]+\d+)*)/);
    if (connectionMatch && currentNode) {
      const children = connectionMatch[1].split(',').map(s => s.trim());
      currentNode.children.push(...children);
    }
    
    // Undevelopedの識別
    if (line.includes('未達成') || line.includes('Undeveloped')) {
      if (currentNode) {
        currentNode.isUndeveloped = true;
      }
    }
  }
  
  return nodes;
}

//GSNテキストの妥当性をチェック
export function validateGSNText(text: string): {
  isValid: boolean;
  issues: string[];
  stats: {
    goals: number;
    strategies: number;
    evidences: number;
    contexts: number;
  };
} {
  const issues: string[] = [];
  
  // GSN要素のカウント
  const goals = (text.match(/\b[Gg]\d+/g) || []).length;
  const strategies = (text.match(/\b[Ss]\d+/g) || []).length;
  const evidences = (text.match(/\b(?:Sn|[Ee])\d+/g) || []).length;
  const contexts = (text.match(/\b[Cc]\d+/g) || []).length;
  
  // 基本的な妥当性チェック
  if (goals === 0) {
    issues.push('Goalノードが見つかりません');
  }
  
  if (strategies === 0 && goals > 1) {
    issues.push('複数のGoalがあるがStrategyノードが見つかりません');
  }
  
  if (evidences === 0) {
    issues.push('EvidenceまたはSolutionノードが見つかりません');
  }
  
  // トップゴール（G1）の存在確認
  if (!text.match(/\b[Gg]1\b/)) {
    issues.push('トップゴール（G1）が見つかりません');
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    stats: {
      goals,
      strategies,
      evidences,
      contexts
    }
  };
}