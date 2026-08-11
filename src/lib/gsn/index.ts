// src/lib/gsn/index.ts
// GSN解析モジュール（フロントエンド表示用）
//
// Lambda 側 (lambda/src/lib/gsn/) のパースロジックのコピーを使用し、
// レポート生成時に Lambda が認識する GSN 構造を UI に表示する。

export * from './types';
export { parseGSN, buildParsedGSN, GSN_NODE_ID_PATTERN } from './parser';
export { extractMandatorySafetyCore } from './mandatory-core';
export {
  analyzeGSNText,
  analyzeGSNFiles,
  deriveAnalysis,
  countCoreNodes,
  compareNodeIds,
  type GSNAnalysis,
  type GSNTreeNode,
} from './analyze';
export {
  serializeGSNToMarkdown,
  suggestNextNodeId,
  EMPTY_CELL_PLACEHOLDER,
} from './serialize';
export {
  HICASE_STAKEHOLDER_CONFIGS,
  getHiCaseStakeholderConfig,
  categoryOfNodeType,
  buildHiCaseView,
} from './hicase-view';
