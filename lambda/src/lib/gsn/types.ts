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

// hicase: 階層的セーフティケースのノード種別
// higoal = Goal/SubGoal連鎖、histrategy = Strategy連鎖、hievidence = Solution/Evidence連鎖
// Context/Assumption/Justification/Undeveloped は型を持たず、常に親のopen/closed状態を継承する（null）
export type HiNodeType = 'higoal' | 'histrategy' | 'hievidence';

// mandatory safety coreを強制開放する際の、ステークホルダ別の詳細度
export type HiCaseMandatoryCoreDetail = 'count' | 'one-sentence' | 'full' | 'full-with-reverification';

// ステークホルダー別のhinode open/closed設定
export interface HiCaseStakeholderConfig {
  stakeholderId: string;
  higoal: 'open' | 'closed';
  histrategy: 'open' | 'closed';
  hievidence: 'open' | 'closed';
  maxDepth: number;
  mandatoryCoreDetail: HiCaseMandatoryCoreDetail;
  description: string;
}

// mandatory coreの強制開放先が見つからない場合に、直近の表示済み祖先へ付与する圧縮注記
export interface HiCaseMandatoryCoreAnnotation {
  count: number;
  oneSentenceItems: { id: string; text: string }[];
}

// hicaseビュー内の1ノード（開閉判定済み）
export interface HiCaseNode {
  node: GSNNode;
  hiNodeType: HiNodeType | null;
  isOpen: boolean;
  isMandatoryCoreMember: boolean;
  isMandatoryCoreForced: boolean;
  mandatoryCoreAnnotation: HiCaseMandatoryCoreAnnotation | null;
  depth: number;
  children: HiCaseNode[];
}

// ステークホルダー別に構築されたhicaseビュー（複数ルート対応）
export interface HiCaseView {
  stakeholderId: string;
  roots: HiCaseNode[];
  mandatoryCoreDetail: HiCaseMandatoryCoreDetail;
}
