// lib/md-converter/safety/normalizer.ts
// 安全性文書の正規化

import { addPreserveMarkers } from './preserve-markers';

/**
 * 安全性文書の正規化
 * - ID強調（H-XXX, SR-XXX, R-XXX, GSN要素）
 * - 保護マーカーの追加
 */
export function normalizeSafetyDocument(text: string): string {
  let normalized = text;

  // ID強調（既に太字でない場合のみ）
  // ハザードID: H-001, H-002, etc.
  // 安全要求ID: SR-001, SR-002, etc.
  // リスクID: R-001, R-002, etc.
  normalized = normalized.replace(
    /(?<!\*\*)\b(H-\d{3}|SR-\d{3}|R-\d{3})\b(?!\*\*)/g,
    '**$1**'
  );
  
  // GSN要素: G1, G1.1, S1, S1.2, Sn1, C1, etc.
  normalized = normalized.replace(
    /(?<!\*\*)\b(G\d+(?:\.\d+)*|S\d+(?:\.\d+)*|Sn\d+|C\d+)\b(?!\*\*)/g,
    '**$1**'
  );

  // 保護マーカー追加
  normalized = addPreserveMarkers(normalized);

  return normalized;
}
