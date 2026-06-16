// lambda/src/lib/gsn/types.ts
// GSN-Based Stakeholder View Generation: 型定義

export type GSNNodeType =
  | 'Goal'
  | 'SubGoal'
  | 'Strategy'
  | 'Context'
  | 'Assumption'
  | 'Solution'
  | 'Evidence'
  | 'Justification'
  | 'Undeveloped';

export type GSNNodeStatus = 'achieved' | 'partial' | 'unachieved' | 'unknown';

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export type AbstractionLevel = 'executive' | 'business' | 'technical' | 'detailed';

export interface GSNNode {
  id: string;
  type: GSNNodeType;
  description: string;
  status: GSNNodeStatus;
  severity: RiskSeverity;
  asilLevel?: string;
  parentIds: string[];
  childIds: string[];
  evidenceRefs: string[];
  isOpenIssue: boolean;
  hasFailedVerification: boolean;
  isUnverifiedRequirement: boolean;
  depth: number;
  rawText?: string;
}

// ステークホルダー別のGSNトラバーサル設定
export interface StakeholderGSNConfig {
  stakeholderId: string;
  traversalDepth: number;
  focusedNodeTypes: GSNNodeType[];
  requiredNodeTypes: GSNNodeType[];
  abstractionLevel: AbstractionLevel;
  description: string;
}

// Mandatory Safety Core: 全ロールのレポートに必ず含める項目
export interface MandatorySafetyCore {
  highSeverityHazards: GSNNode[];
  asilDItems: GSNNode[];
  unverifiedRequirements: GSNNode[];
  openIssues: GSNNode[];
  failedVerifications: GSNNode[];
  criticalAssumptions: GSNNode[];
}

// ステークホルダー特化ビュー
export interface GSNView {
  stakeholderId: string;
  selectedNodes: GSNNode[];
  mandatoryCore: MandatorySafetyCore;
  queryHints: string[];
  summary: string;
}

// パース済みGSN
export interface ParsedGSN {
  nodes: Map<string, GSNNode>;
  rootNodeIds: string[];
  nodesByType: Map<GSNNodeType, GSNNode[]>;
  overallStatus: GSNNodeStatus;
}
