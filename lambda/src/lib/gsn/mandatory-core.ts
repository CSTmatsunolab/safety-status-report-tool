// lambda/src/lib/gsn/mandatory-core.ts
// Mandatory Safety Coreの抽出
// 全ステークホルダーレポートに必ず含めるべき重要安全情報

import { GSNNode, HiCaseMandatoryCoreDetail, MandatorySafetyCore, ParsedGSN } from './types';

/**
 * パース済みGSNからMandatory Safety Coreを抽出する
 *
 * Mandatory Safety Core の候補:
 * - 高severity hazard
 * - ASIL-D相当または最高リスク項目
 * - 未検証の安全要求
 * - open issue
 * - failed verification
 * - safety case全体の結論に影響するassumptionやcontext
 */
export function extractMandatorySafetyCore(parsedGSN: ParsedGSN): MandatorySafetyCore {
  const allNodes = Array.from(parsedGSN.nodes.values());

  const highSeverityHazards = allNodes.filter(n =>
    n.severity === 'high' || n.severity === 'critical'
  );

  const asilDItems = allNodes.filter(n =>
    n.asilLevel === 'ASIL-D' || n.asilLevel === 'ASIL-C'
  );

  const unverifiedRequirements = allNodes.filter(n =>
    n.isUnverifiedRequirement ||
    (n.type === 'SubGoal' && (n.status === 'partial' || n.status === 'unachieved') &&
      (n.description.includes('要件') || n.description.includes('requirement') ||
       n.description.includes('検証') || n.description.includes('verif')))
  );

  const openIssues = allNodes.filter(n => n.isOpenIssue);

  const failedVerifications = allNodes.filter(n =>
    n.hasFailedVerification ||
    (n.type === 'Solution' && n.status === 'unachieved')
  );

  // safety case全体の結論に影響するContextとAssumption
  // = ルートゴールの直下にあるもの、またはステータスが部分達成以下のもの
  const rootNodeIds = new Set(parsedGSN.rootNodeIds);
  const criticalAssumptions = allNodes.filter(n => {
    if (n.type !== 'Context' && n.type !== 'Assumption') return false;
    // ルートゴールに直接接続
    return n.parentIds.some(pid => rootNodeIds.has(pid));
  });

  return {
    highSeverityHazards,
    asilDItems,
    unverifiedRequirements,
    openIssues,
    failedVerifications,
    criticalAssumptions,
  };
}

/**
 * Mandatory Safety Coreを人間が読めるテキストに変換
 *
 * detailLevel はステークホルダーのhicase設定（HiCaseStakeholderConfig.mandatoryCoreDetail）に対応する:
 * - 'count': カテゴリ名+件数のみ（CxO向け。項目列挙なし）
 * - 'one-sentence': 現行の1行/項目形式（Business/Product向け）
 * - 'full': 1行/項目形式、変更なし（Technical Fellows/Architect向け）
 * - 'full-with-reverification': full + 各項目の再検証条件（evidenceRefs）を追記（R&D向け）
 */
export function formatMandatorySafetyCore(
  core: MandatorySafetyCore,
  detailLevel: HiCaseMandatoryCoreDetail = 'full'
): string {
  const sections: string[] = [];

  const categories: { title: string; nodes: GSNNode[] }[] = [
    { title: '高Severityハザード（High/Critical）', nodes: core.highSeverityHazards },
    { title: 'ASIL-D相当の最高リスク項目', nodes: core.asilDItems },
    { title: '未検証の安全要求（Unverified Safety Requirements）', nodes: core.unverifiedRequirements },
    { title: 'Open Issues（未解決事項）', nodes: core.openIssues },
    { title: 'Failed Verification（検証失敗）', nodes: core.failedVerifications },
    { title: 'Safety Caseに影響するAssumption/Context', nodes: core.criticalAssumptions },
  ];

  const formatNode = (n: GSNNode): string => {
    const asil = n.asilLevel ? ` [${n.asilLevel}]` : '';
    const reverification =
      detailLevel === 'full-with-reverification' && n.evidenceRefs.length > 0
        ? ` [再検証条件: ${n.evidenceRefs.join(', ')}]`
        : '';
    return `- **${n.id}**: ${n.description || '記載なし'}${asil}${reverification}`;
  };

  sections.push('## [Mandatory Safety Core] 全ステークホルダー共通の重要安全情報');
  sections.push('');
  sections.push('> この情報はステークホルダーに関わらず全レポートに必ず含めること。');
  sections.push('');

  for (const { title, nodes } of categories) {
    if (nodes.length === 0) continue;
    sections.push(`### ${title}`);
    sections.push(detailLevel === 'count' ? `${nodes.length}件` : nodes.map(formatNode).join('\n'));
    sections.push('');
  }

  const totalItems = categories.reduce((sum, c) => sum + c.nodes.length, 0);

  if (totalItems === 0) {
    sections.push('### 重大な未解決事項なし');
    sections.push('全ての必須安全項目が対処済みです。');
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Mandatory Safety Coreの存在を確認するサマリーを生成
 */
export function getMandatoryCoreSummary(core: MandatorySafetyCore): string {
  const counts = {
    highSeverity: core.highSeverityHazards.length,
    asilD: core.asilDItems.length,
    unverified: core.unverifiedRequirements.length,
    openIssues: core.openIssues.length,
    failedVerif: core.failedVerifications.length,
    criticalAssumptions: core.criticalAssumptions.length,
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return '重大な未解決安全課題はありません。';
  }

  const parts: string[] = [];
  if (counts.highSeverity > 0) parts.push(`高Severityハザード${counts.highSeverity}件`);
  if (counts.asilD > 0) parts.push(`ASIL-D相当${counts.asilD}件`);
  if (counts.unverified > 0) parts.push(`未検証安全要求${counts.unverified}件`);
  if (counts.openIssues > 0) parts.push(`OpenIssue${counts.openIssues}件`);
  if (counts.failedVerif > 0) parts.push(`検証失敗${counts.failedVerif}件`);
  if (counts.criticalAssumptions > 0) parts.push(`重要Assumption${counts.criticalAssumptions}件`);

  return `【要注意】${parts.join('、')}が存在します。`;
}
