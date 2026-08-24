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
// Context/Assumption/Justification/Undeveloped は型を持たず（null）、
// 論文どおり hinode の内部要素として扱うため、親（それを内包する hinode）の
// open/closed 状態を継承する。親が closed の場合は見出しにせず、親の要約へ吸収する。
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

// closedなhinodeの内部に吸収された非hinode要素（Context/Assumption/Justification/Undeveloped）
// 見出しにはしないが、親セクションの要約で触れるべき内容として保持する
export interface HiCaseAbsorbedNode {
  id: string;
  type: GSNNodeType;
  description: string;
}

// hicaseビュー内の1ノード（開閉判定済み）
export interface HiCaseNode {
  node: GSNNode;
  hiNodeType: HiNodeType | null;
  // 型を持たないノード（Context/Assumption等）は親の状態を継承した結果が入る
  isOpen: boolean;
  isMandatoryCoreMember: boolean;
  isMandatoryCoreForced: boolean;
  // hievidenceがclosed設定でも、証拠連鎖が完全展開済みでないため開かれた場合にtrue
  isForcedOpenByIncompleteEvidence: boolean;
  mandatoryCoreAnnotation: HiCaseMandatoryCoreAnnotation | null;
  absorbedNodes: HiCaseAbsorbedNode[];
  depth: number;
  children: HiCaseNode[];
}

// ステークホルダー別に構築されたhicaseビュー（複数ルート対応）
export interface HiCaseView {
  stakeholderId: string;
  roots: HiCaseNode[];
  mandatoryCoreDetail: HiCaseMandatoryCoreDetail;
}
