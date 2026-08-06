// src/lib/gsn/mandatory-core.ts
// Mandatory Safety Coreの抽出（フロントエンド表示用）
//
// ⚠️ lambda/src/lib/gsn/mandatory-core.ts の extractMandatorySafetyCore のコピー。
// Lambda 側がレポートに必ず含める項目と UI の表示を一致させるため、
// 抽出条件を変更する場合は必ず両方を同じ内容に保つこと。
// （Lambda 側の formatMandatorySafetyCore 等プロンプト生成用の関数は移植していない）

import { MandatorySafetyCore, ParsedGSN } from './types';

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
