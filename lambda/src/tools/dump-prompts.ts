// lambda/src/tools/dump-prompts.ts
// ステークホルダー別の「1パス目 / 2パス目」プロンプトをMarkdownとして書き出す開発用スクリプト。
//   使い方: cd lambda && npm run build && node dist/tools/dump-prompts.js <出力先ディレクトリ>
// index.ts のプロンプト構築手順を同じ順序で再現する（RAG検索とClaude呼び出しは行わない）。

import * as fs from 'fs';
import * as path from 'path';
import { Stakeholder } from '../types';
import { determineAdvancedRhetoricStrategy } from '../lib/rhetoric-strategies';
import { buildCompleteUserPrompt, generateSystemPrompt } from '../lib/report-prompts';
import { buildRestructurePrompt, generateRestructureSystemPrompt } from '../lib/restructure-prompts';
import {
  getStakeholderRequiredSections,
  getRequiredSectionTitles,
  getRequiredSectionQueries,
  mapRequiredSectionsToTemplate,
} from '../lib/stakeholder-requirements';
import {
  parseGSN,
  extractMandatorySafetyCore,
  generateStakeholderGSNView,
  buildHiCaseView,
  generateOutlineFromHiCaseView,
  generateOutlineFromGSNView,
} from '../lib/gsn';

// ---------------------------------------------------------------------------
// 入力データ（フロントエンド src/lib/stakeholders.ts / report-structures.ts と同内容）
// ---------------------------------------------------------------------------

const STAKEHOLDERS: Stakeholder[] = [
  { id: 'cxo', role: 'CxO / 経営層', concerns: ['戦略的整合性', '企業価値への影響', 'リスク管理', 'ステークホルダーへの説明責任'] },
  { id: 'technical-fellows', role: 'Technical Fellows / 技術専門家', concerns: ['技術的な卓越性', 'ベストプラクティスの適用', '長期的な技術戦略', '技術的イノベーション'] },
  { id: 'architect', role: 'Architect / アーキテクト', concerns: ['システム設計の整合性', 'スケーラビリティ', '技術的負債', 'アーキテクチャの保守性'] },
  { id: 'business', role: 'Business Division / 事業部門', concerns: ['ビジネスインパクト', 'ROIと収益性', '市場シェア', '事業リスク'] },
  { id: 'product', role: 'Product Division / 製品部門', concerns: ['製品の品質と安全性', '市場競争力', 'ユーザビリティ', '製品化のタイムライン'] },
  { id: 'r-and-d', role: 'R&D Division / 研究開発部門', concerns: ['技術的な実現可能性', '開発リソースの効率性', 'イノベーションの機会', '技術的リスクと課題'] },
];

interface StructureTemplate {
  id: string;
  name: string;
  description: string;
  sections: string[];
  gsnSections?: string[];
}

const STRUCTURES: Record<string, StructureTemplate> = {
  executive: {
    id: 'executive',
    name: '経営向けレポート',
    description: 'ビジネス影響と意思決定に焦点',
    sections: ['エグゼクティブサマリー', '現状分析', 'リスク評価', '推奨事項', '次のステップ'],
    gsnSections: ['GSN目標達成状況サマリー', '主要リスク制御戦略'],
  },
  'technical-detailed': {
    id: 'technical-detailed',
    name: '技術詳細レポート',
    description: '技術的根拠と実装詳細を重視',
    sections: ['エグゼクティブサマリー', '技術概要', 'システムアーキテクチャ', '実装詳細', 'テスト結果と品質指標', '技術的リスクと対策', '今後の改善提案'],
    gsnSections: ['GSN構造分析', 'Goal-Strategy-Evidence対応表', '技術的ギャップ分析'],
  },
  'problem-solving': {
    id: 'problem-solving',
    name: '問題解決型レポート',
    description: '課題の根本原因と解決策',
    sections: ['エグゼクティブサマリー', '未達成状態の整理', '問題と影響の整理', '根本原因分析', '現在実施中の対応と残課題', '今後の見通しと制約条件'],
    gsnSections: ['未達成Goal分析'],
  },
};

// getSimpleRecommendedStructure(recommendedFor) の結果と一致
const STRUCTURE_BY_STAKEHOLDER: Record<string, string> = {
  cxo: 'executive',
  'technical-fellows': 'technical-detailed',
  architect: 'technical-detailed',
  business: 'executive',
  product: 'problem-solving',
  'r-and-d': 'technical-detailed',
};

// index.ts の buildFinalReportStructure と同一
function buildFinalReportStructure(base: StructureTemplate, hasGSN: boolean): string[] {
  if (!hasGSN) return base.sections;
  const finalSections = [...base.sections];
  const gsnSections = base.gsnSections || [];
  if (gsnSections.length === 0) return finalSections;
  finalSections.splice(1, 0, gsnSections[0]);
  if (base.id === 'technical-detailed' && gsnSections.length > 1) {
    finalSections.splice(4, 0, ...gsnSections.slice(1));
  } else if (gsnSections.length > 1) {
    finalSections.splice(3, 0, ...gsnSections.slice(1));
  }
  return finalSections;
}

// 実行時にRAG検索・1パス目出力で埋まる部分のプレースホルダ
const CONTEXT_PLACEHOLDER = `{{ここに提供文書のコンテキストが入る（実行時に生成）:
 - 全文読み込みファイル（1ファイル最大50,000字 / 合計最大150,000字）
 - GSN ステークホルダービュー（gsnViewToContextText）
 - GSN Subtree-Aware RAG抽出内容（performGSNSubtreeAwareSearch の結果）
 - Mandatory Safety Core（formatMandatorySafetyCore の出力）
}}`;

const DRAFT_PLACEHOLDER = '{{ここに1パス目（GSN由来アウトライン）で生成されたレポート本文が入る}}';

const LANGUAGE: 'ja' | 'en' = 'ja';
const GSN_SAMPLE = path.resolve(__dirname, '../../../evaluation/ssr-quality-eval/inputs/TEST_GSN_Structure.md');

function fence(body: string): string {
  return '````text\n' + body + '\n````\n';
}

function main(): void {
  const outRoot = process.argv[2];
  if (!outRoot) {
    console.error('usage: node dist/tools/dump-prompts.js <output-dir>');
    process.exit(1);
  }
  const pass1Dir = path.join(outRoot, '第一パスLLM用プロンプト');
  const pass2Dir = path.join(outRoot, '第二パスLLM用プロンプト');
  fs.mkdirSync(pass1Dir, { recursive: true });
  fs.mkdirSync(pass2Dir, { recursive: true });

  const gsnRawText = fs.readFileSync(GSN_SAMPLE, 'utf-8');
  const parsedGSN = parseGSN(gsnRawText);
  const mandatoryCore = extractMandatorySafetyCore(parsedGSN);

  const systemPass1 = generateSystemPrompt();
  const systemPass2 = generateRestructureSystemPrompt();

  for (const stakeholder of STAKEHOLDERS) {
    const structure = STRUCTURES[STRUCTURE_BY_STAKEHOLDER[stakeholder.id]];
    const strategy = determineAdvancedRhetoricStrategy(stakeholder);
    const requiredSections = getStakeholderRequiredSections(stakeholder, LANGUAGE);
    const requiredSectionTitles = getRequiredSectionTitles(requiredSections);

    // --- 1パス目: GSN(hicase)由来アウトライン ---
    const gsnView = generateStakeholderGSNView(stakeholder.id, parsedGSN, mandatoryCore);
    const hicaseView = buildHiCaseView(parsedGSN, mandatoryCore, stakeholder.id);
    let outlineSource: 'hicase' | 'gsn-flat' = 'hicase';
    let finalSections = generateOutlineFromHiCaseView(hicaseView, LANGUAGE, mandatoryCore, requiredSectionTitles);
    if (finalSections.length === 0) {
      finalSections = generateOutlineFromGSNView(gsnView, stakeholder.id, LANGUAGE, requiredSectionTitles);
      outlineSource = 'gsn-flat';
    }

    const pass1Prompt = buildCompleteUserPrompt({
      stakeholder,
      strategy,
      contextContent: CONTEXT_PLACEHOLDER,
      reportSections: finalSections,
      hasGSN: true,
      structureDescription: structure.description,
      hasMandatoryCore: true,
      mandatoryCoreDetail: hicaseView.mandatoryCoreDetail,
      requiredSections,
    });

    // --- 2パス目: ステークホルダー構成への再編成 ---
    const targetSections = buildFinalReportStructure(structure, true);
    const requiredPlacements = mapRequiredSectionsToTemplate(targetSections, requiredSections);
    const pass2Prompt = buildRestructurePrompt({
      draftContent: DRAFT_PLACEHOLDER,
      stakeholder,
      targetSections,
      structureName: structure.name,
      structureDescription: structure.description,
      hasMandatoryCore: true,
      mandatoryCoreDetail: hicaseView.mandatoryCoreDetail,
      requiredPlacements,
    });

    const header = (pass: string, extra: string) => `---
stakeholder_id: ${stakeholder.id}
pass: ${pass}
language: ${LANGUAGE}
---

# ${stakeholder.role} — ${pass}

- ステークホルダーID: \`${stakeholder.id}\`
- 関心事: ${(stakeholder.concerns || []).join(' / ')}
- レトリック戦略: ${strategy}
- レポート構成テンプレート: ${structure.name} (\`${structure.id}\`)
${extra}
> 生成元: \`lambda/src/tools/dump-prompts.ts\`（GSNサンプル: \`evaluation/ssr-quality-eval/inputs/TEST_GSN_Structure.md\`）
> 実行時に決まる部分（RAG検索結果・1パス目本文）はプレースホルダ \`{{...}}\` にしてある。
`;

    const pass1Doc = `${header('第一パス（GSN由来アウトラインでの生成）', `- アウトライン生成元: ${outlineSource}
- Mandatory Core 表示粒度: ${hicaseView.mandatoryCoreDetail}
- 必須セクション: ${requiredSectionTitles.join(' / ') || '（なし）'}
- 必須セクション用RAGクエリ: ${getRequiredSectionQueries(requiredSections).join(' / ') || '（なし）'}
`)}
## 1パス目 アウトライン（GSN hicaseビュー由来）

${fence(finalSections.map((s, i) => `${/^\d/.test(s) ? '' : `${i + 1}. `}${s}`).join('\n'))}
## system プロンプト（\`generateSystemPrompt()\`）

${fence(systemPass1)}
## user プロンプト（\`buildCompleteUserPrompt()\`）

${fence(pass1Prompt)}`;

    const pass2Doc = `${header('第二パス（ステークホルダー構成への再編成）', `- 再構成先セクション数: ${targetSections.length}
- 必須内容の配置先: ${requiredPlacements.map(pl => `${pl.sectionTitle} ← ${pl.requirements.map(r => r.title).join('、')}`).join(' / ') || '（なし）'}
`)}
## 再構成先の目標構成（ステークホルダーのテンプレート構成そのもの）

${fence(targetSections.map((s, i) => `${i + 1}. ${s}`).join('\n'))}
## system プロンプト（\`generateRestructureSystemPrompt()\`）

${fence(systemPass2)}
## user プロンプト（\`buildRestructurePrompt()\`）

${fence(pass2Prompt)}`;

    const fileName = `${stakeholder.id}.md`;
    fs.writeFileSync(path.join(pass1Dir, fileName), pass1Doc, 'utf-8');
    fs.writeFileSync(path.join(pass2Dir, fileName), pass2Doc, 'utf-8');
    console.log(`${stakeholder.id}: pass1=${pass1Prompt.length}字 (outline=${outlineSource}, ${finalSections.length}節), pass2=${pass2Prompt.length}字`);
  }
}

main();
