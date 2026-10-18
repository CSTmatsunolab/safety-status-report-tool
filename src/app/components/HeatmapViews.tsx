// src/app/components/HeatmapViews.tsx
// レポート表示用: ヒートマップのモーダル（リスク／GSNノードの切り替え）と、
// ReactMarkdown で ```risk-heatmap / ```gsn-heatmap ブロックを描画する部品
'use client';

import { isValidElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import type { Components } from 'react-markdown';
import { FiX } from 'react-icons/fi';
import { useI18n } from './I18nProvider';
import { RiskHeatmap } from './RiskHeatmap';
import { GsnHeatmap } from './GsnHeatmap';
import { HeatmapKind, HeatmapSwitcher, defaultHeatmapKind } from './HeatmapSwitcher';
import { RISK_HEATMAP_LANG, RiskHeatmapItem, markReportMentions, parseHeatmapBlock } from '@/lib/risk-heatmap';
import { GSN_HEATMAP_LANG, GsnHeatmapItem, markGsnReportMentions, parseGsnHeatmapBlock } from '@/lib/gsn-heatmap';
import { StakeholderProfile, toStakeholderProfile } from '@/lib/gsn-categories';

const TEXTS = {
  ja: {
    title: 'ヒートマップ',
    close: '閉じる',
    loadingRisk: 'リスクヒートマップを生成中…',
    loadingGsn: 'GSNノードヒートマップを生成中…',
    noRisk: 'このレポートにはリスクヒートマップのデータがありません。',
    noGsn: 'このレポートにはGSNノードヒートマップのデータがありません（GSNファイルを指定して生成したレポートで表示されます）。',
  },
  en: {
    title: 'Heatmap',
    close: 'Close',
    loadingRisk: 'Generating risk heatmap…',
    loadingGsn: 'Generating GSN node heatmap…',
    noRisk: 'This report has no risk heatmap data.',
    noGsn: 'This report has no GSN node heatmap data (available for reports generated with a GSN file).',
  },
};

interface HeatmapModalProps {
  isOpen: boolean;
  onClose: () => void;
  risks: RiskHeatmapItem[];
  gsnNodes: GsnHeatmapItem[];
  // GSNノードヒートマップで強調する列（レポート対象のステークホルダが必要とする情報カテゴリー）
  gsnStakeholderProfile?: StakeholderProfile | null;
}

export function HeatmapModal({ isOpen, onClose, risks, gsnNodes, gsnStakeholderProfile }: HeatmapModalProps) {
  const { language } = useI18n();
  const t = TEXTS[language];
  const riskCount = risks.length > 0 ? risks.length : null;
  const gsnCount = gsnNodes.length > 0 ? gsnNodes.length : null;
  const [kind, setKind] = useState<HeatmapKind>('risk');

  // 開くたびにデータがある方を初期表示にする
  useEffect(() => {
    if (isOpen) setKind(defaultHeatmapKind(riskCount, gsnCount));
  }, [isOpen, riskCount, gsnCount]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white dark:bg-gray-800 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t.title}</h3>
            <HeatmapSwitcher value={kind} onChange={setKind} riskCount={riskCount} gsnCount={gsnCount} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
          >
            <FiX size={20} />
          </button>
        </div>
        {kind === 'risk' ? (
          riskCount ? <RiskHeatmap risks={risks} /> : <p className="text-sm text-gray-600 dark:text-gray-400">{t.noRisk}</p>
        ) : gsnCount ? (
          <GsnHeatmap nodes={gsnNodes} profile={gsnStakeholderProfile} />
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400">{t.noGsn}</p>
        )}
      </div>
    </div>
  );
}

function HeatmapLoading({ text }: { text: string }) {
  return (
    <div className="not-prose my-6 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-4 text-sm text-gray-500 dark:text-gray-400">
      {text}
    </div>
  );
}

function RiskHeatmapBlock({ json, reportContent }: { json: string; reportContent: string }) {
  const { language } = useI18n();
  const data = parseHeatmapBlock(json);
  if (!data) return <HeatmapLoading text={TEXTS[language].loadingRisk} />;
  return <RiskHeatmap risks={markReportMentions(data.risks, reportContent)} title={data.title} />;
}

function GsnHeatmapBlock({ json, reportContent }: { json: string; reportContent: string }) {
  const { language } = useI18n();
  const data = parseGsnHeatmapBlock(json);
  if (!data) return <HeatmapLoading text={TEXTS[language].loadingGsn} />;
  return (
    <GsnHeatmap
      nodes={markGsnReportMentions(data.nodes, reportContent)}
      title={data.title}
      profile={toStakeholderProfile(data.stakeholderCategories, data.stakeholderLayers)}
    />
  );
}

function codeLanguages(className?: string): string[] {
  return className?.split(/\s+/) ?? [];
}

function nodeText(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(nodeText).join('');
  return '';
}

/**
 * ReactMarkdown 用: ```risk-heatmap / ```gsn-heatmap ブロックをヒートマップとして描画する
 * reportContent はレポート全文（本レポートで記載しているリスク・ノードの判定に使う）
 */
export function createHeatmapMarkdownComponents(reportContent: string): Components {
  return {
    // node は DOM に渡さないよう取り除く
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    pre({ children, node, ...props }) {
      // ヒートマップは <pre> で包まずにそのまま描画する
      if (isValidElement(children)) {
        const child = children as ReactElement<{ className?: string; children?: ReactNode }>;
        const langs = codeLanguages(child.props.className);
        if (langs.includes(`language-${RISK_HEATMAP_LANG}`)) {
          return <RiskHeatmapBlock json={nodeText(child.props.children)} reportContent={reportContent} />;
        }
        if (langs.includes(`language-${GSN_HEATMAP_LANG}`)) {
          return <GsnHeatmapBlock json={nodeText(child.props.children)} reportContent={reportContent} />;
        }
      }
      return <pre {...props}>{children}</pre>;
    },
  };
}
