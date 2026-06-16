// lambda/src/lib/gsn/outline-generator.ts
// GSNビューからステークホルダー固有のレポートアウトラインを動的生成

import { GSNView, GSNNode, AbstractionLevel } from './types';

const MAX_SECTIONS = 15;
const GOAL_DESC_MAX_CHARS = 40;

function label(ja: string, en: string, language: 'ja' | 'en'): string {
  return language === 'en' ? en : ja;
}

function resolveFrame(stakeholderId: string): AbstractionLevel {
  if (stakeholderId === 'cxo') return 'executive';
  if (stakeholderId === 'business' || stakeholderId === 'product') return 'business';
  if (stakeholderId === 'architect' || stakeholderId === 'technical-fellows') return 'technical';
  return 'detailed';
}

function truncateDesc(desc: string): string {
  if (desc.length <= GOAL_DESC_MAX_CHARS) return desc;
  return desc.substring(0, GOAL_DESC_MAX_CHARS) + '…';
}

/**
 * GSNビューからステークホルダー向けレポートアウトラインを生成する。
 * GSNファイルが存在する場合に、固定テンプレートの代わりに使用される。
 */
export function generateOutlineFromGSNView(
  view: GSNView,
  stakeholderId: string,
  language: 'ja' | 'en' = 'ja'
): string[] {
  const { selectedNodes, mandatoryCore } = view;
  const frame = resolveFrame(stakeholderId);

  // GSNノードをタイプ別に分類
  const goalNodes = selectedNodes.filter(n => n.type === 'Goal');
  const subGoalNodes = selectedNodes.filter(n => n.type === 'SubGoal');
  const strategyNodes = selectedNodes.filter(n => n.type === 'Strategy');
  const contextNodes = selectedNodes.filter(n => n.type === 'Context');
  const assumptionNodes = selectedNodes.filter(n => n.type === 'Assumption');
  const solutionNodes = selectedNodes.filter(
    n => n.type === 'Solution' || n.type === 'Evidence'
  );

  // Mandatory Safety Core フラグ
  const hasHighSeverity = mandatoryCore.highSeverityHazards.length > 0;
  const hasAsilD = mandatoryCore.asilDItems.length > 0;
  const hasOpenIssues = mandatoryCore.openIssues.length > 0;
  const hasFailedVer = mandatoryCore.failedVerifications.length > 0;
  const hasUnverified = mandatoryCore.unverifiedRequirements.length > 0;
  const hasCriticalAssumpts = mandatoryCore.criticalAssumptions.length > 0;

  // ノードが存在しない場合の最小アウトライン
  if (goalNodes.length === 0 && selectedNodes.length <= 1) {
    return buildFallbackOutline(language);
  }

  const sections: string[] = [];

  // ── 冒頭セクション（フレーム固定）──
  sections.push(label('エグゼクティブサマリー', 'Executive Summary', language));

  if (frame === 'executive') {
    sections.push(label('全体安全ステータス', 'Overall Safety Status', language));
  } else if (frame === 'business') {
    sections.push(label('事業影響サマリー', 'Business Impact Summary', language));
  } else if (frame === 'technical') {
    sections.push(label('技術概要・アーキテクチャ', 'Technical Overview and Architecture', language));
  } else {
    sections.push(label('技術詳細・実装状況', 'Technical Details and Implementation Status', language));
  }

  // ── GSN Goal 達成状況 ──
  if (goalNodes.length > 0) {
    sections.push(label(
      'GSN 安全目標（Goal）達成状況',
      'GSN Safety Goal Achievement Status',
      language
    ));

    // detailed / technical フレームでは各 Goal を個別セクション化
    if ((frame === 'detailed' || frame === 'technical') && goalNodes.length > 1) {
      const rootGoals = goalNodes.filter(n => n.parentIds.length === 0);
      const goalsToExpand = rootGoals.length > 0 ? rootGoals : goalNodes.slice(0, 4);
      for (const goal of goalsToExpand) {
        sections.push(`${goal.id}: ${truncateDesc(goal.description)}`);
      }
    }
  }

  // ── SubGoal（business / technical / detailed）──
  if (subGoalNodes.length > 0 && frame !== 'executive') {
    sections.push(label(
      'サブゴール（SubGoal）と中間論証',
      'Sub-Goals and Intermediate Arguments',
      language
    ));
  }

  // ── Strategy・設計根拠（technical / detailed のみ）──
  if (strategyNodes.length > 0 && (frame === 'technical' || frame === 'detailed')) {
    sections.push(label(
      '論証戦略（Strategy）と設計根拠',
      'Argument Strategies and Design Rationale',
      language
    ));
  }

  // ── Context / Assumption（technical / detailed のみ）──
  if ((contextNodes.length > 0 || assumptionNodes.length > 0) &&
      (frame === 'technical' || frame === 'detailed')) {
    sections.push(label(
      '前提条件（Context/Assumption）と有効性評価',
      'Context and Assumption Validity',
      language
    ));
  }

  // ── Evidence / Solution ──
  if (solutionNodes.length > 0) {
    if (frame === 'detailed') {
      sections.push(label(
        '検証結果・エビデンス詳細',
        'Verification Results and Evidence Details',
        language
      ));
    } else {
      sections.push(label(
        'エビデンスサマリー',
        'Evidence Summary',
        language
      ));
    }
  }

  // ── リスク分析（全フレーム）──
  sections.push(label(
    'リスク分析と残存リスク',
    'Risk Analysis and Residual Risks',
    language
  ));

  // ── Mandatory Safety Core セクション ──
  if (frame === 'executive') {
    // 経営向けは一本化
    if (hasHighSeverity || hasAsilD || hasOpenIssues || hasFailedVer ||
        hasUnverified || hasCriticalAssumpts) {
      sections.push(label(
        'Mandatory Safety Core — 意思決定必須情報',
        'Mandatory Safety Core — Decision-Critical Information',
        language
      ));
    }
  } else {
    if (hasHighSeverity || hasAsilD) {
      sections.push(label(
        '重大安全課題（Mandatory Safety Core）',
        'Critical Safety Issues (Mandatory Safety Core)',
        language
      ));
    }
    if (hasOpenIssues) {
      sections.push(label(
        '未解決事項（Open Issues）一覧',
        'Open Issues List',
        language
      ));
    }
    if (hasFailedVer) {
      sections.push(label(
        '検証失敗と再試験計画',
        'Failed Verifications and Retest Plan',
        language
      ));
    }
    if (hasUnverified) {
      sections.push(label(
        '未検証安全要求と完了計画',
        'Unverified Safety Requirements and Completion Plan',
        language
      ));
    }
    if (hasCriticalAssumpts) {
      sections.push(label(
        'Safety Caseに影響するAssumption',
        'Assumptions Affecting the Safety Case',
        language
      ));
    }
  }

  // ── 末尾セクション（フレーム固定）──
  if (frame === 'executive') {
    sections.push(label('推奨事項と次のアクション', 'Recommendations and Next Actions', language));
  } else if (frame === 'business') {
    sections.push(label('対応計画とマイルストーン', 'Response Plan and Milestones', language));
    sections.push(label('推奨事項', 'Recommendations', language));
  } else if (frame === 'technical') {
    sections.push(label('技術的リスクと対策', 'Technical Risks and Mitigations', language));
    sections.push(label('改善提案', 'Improvement Proposals', language));
  } else {
    sections.push(label('技術的リスクと対策', 'Technical Risks and Mitigations', language));
    sections.push(label('今後の検証計画', 'Future Verification Plan', language));
    sections.push(label('改善提案', 'Improvement Proposals', language));
  }

  // 重複除去・上限適用
  const deduplicated = [...new Set(sections)];
  return deduplicated.slice(0, MAX_SECTIONS);
}

function buildFallbackOutline(language: 'ja' | 'en'): string[] {
  return [
    label('エグゼクティブサマリー', 'Executive Summary', language),
    label('GSN概要（ノード一覧）', 'GSN Overview (Node List)', language),
    label('リスク・未解決事項', 'Risks and Open Issues', language),
    label('推奨事項', 'Recommendations', language),
  ];
}

/**
 * 生成されたアウトラインがGSN由来かどうかを判定する。
 * generateStructurePrompt での追加注記に使用。
 */
export function isGSNDerivedOutline(sections: string[]): boolean {
  return sections.some(s =>
    s.startsWith('GSN') ||
    /^G\d+:/.test(s) ||
    s.includes('Goal') ||
    s.includes('Strategy') ||
    s.includes('Mandatory Safety Core')
  );
}
