// src/lib/text-processing.ts
import { GSN_CONFIG } from '@/lib/config/constants';

/**
 * GSNテキストを処理して構造を認識しやすくする
 */
export function processGSNText(text: string): string {
  // GSN要素のパターンを定義
  const patterns = [
    { regex: GSN_CONFIG.patterns.goal, label: 'Goal' },
    { regex: GSN_CONFIG.patterns.strategy, label: 'Strategy' },
    { regex: GSN_CONFIG.patterns.context, label: 'Context' },
    { regex: GSN_CONFIG.patterns.solution, label: 'Solution' },
    { regex: GSN_CONFIG.patterns.justification, label: 'Justification' },
  ];
  
  let processedText = text;
  
  // 自動フォーマットが有効な場合のみ処理
  if (GSN_CONFIG.enableAutoFormatting) {
    // 各パターンに対して処理
    patterns.forEach(({ regex, label }) => {
      processedText = processedText.replace(regex, (match, id) => {
        return `\n[${label} ${id}]: `;
      });
    });
    
    // 連続する空白行を処理
    if (!GSN_CONFIG.preserveOriginalSpacing) {
      processedText = processedText.replace(/\n\s*\n\s*\n/g, '\n\n');
    }
    
    // 接続関係を明確化
    processedText = processedText.replace(/→\s*/g, '\n→ ');
  }
  
  return processedText.trim();
}