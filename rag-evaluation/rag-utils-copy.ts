// rag-utils-copy.ts
// SSRツールのsrc/lib/rag-utils.tsから動的K値計算ロジックをコピー
// ※評価スクリプト用にimport文のみ修正

import { Stakeholder } from './types';

/**
 * 動的K値計算関数
 * ステークホルダーとドキュメント数に基づいて最適なK値を計算
 */
export function getDynamicK(
  totalChunks: number, 
  stakeholder: Stakeholder,
  storeType: string
): number {
  // ベース値
  const baseK = Math.ceil(totalChunks * 0.3);
  
  // ステークホルダーIDベースの判定
  let roleMultiplier = 1.0;
  
  switch(stakeholder.id) {
    case 'technical-fellows':
    case 'architect':
    case 'r-and-d':
      roleMultiplier = 1.2;
      break;
    case 'cxo':
    case 'business':
      roleMultiplier = 0.7;
      break;
    case 'product':
      roleMultiplier = 1.0;
      break;
  }

  // カスタムステークホルダー用のフォールバック
  if (stakeholder.id.startsWith('custom_')) {
    const role = stakeholder.role.toLowerCase();
    if (role.includes('技術') || role.includes('開発') || 
        role.includes('エンジニア') || role.includes('アーキテクト')) {
      roleMultiplier = 1.2;
    } else if (role.includes('経営') || role.includes('社長') || 
               role.includes('cxo') || role.includes('役員')) {
      roleMultiplier = 0.7;
    }
  }
  
  // ストアタイプ別の上限
  const limits: Record<string, number> = {
    'pinecone': 50,
    'memory': 20
  };
  
  const maxK = limits[storeType] || 20;
  const finalK = Math.ceil(Math.min(maxK, Math.max(5, baseK * roleMultiplier)));
  
  console.log(`Dynamic K calculation:
    Total chunks: ${totalChunks}
    Base K (30%): ${baseK}
    Role multiplier: ${roleMultiplier}
    Store limit: ${maxK}
    Final K: ${finalK}
  `);

  return finalK;
}
