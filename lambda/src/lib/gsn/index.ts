// lambda/src/lib/gsn/index.ts
// GSN-Based Stakeholder View Generation モジュール

export * from './types';
export { parseGSN } from './parser';
export {
  extractMandatorySafetyCore,
  formatMandatorySafetyCore,
  getMandatoryCoreSummary,
} from './mandatory-core';
export {
  getStakeholderGSNConfig,
  generateStakeholderGSNView,
  gsnViewToQueryText,
  gsnViewToContextText,
} from './stakeholder-view';
export { generateOutlineFromGSNView, getOutlineNodes, isGSNDerivedOutline } from './outline-generator';
