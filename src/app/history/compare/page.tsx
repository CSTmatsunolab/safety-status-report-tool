// src/app/history/compare/page.tsx
// 履歴から選んだ複数レポートのステークホルダ間ギャップ行列（/history/compare?ids=a,b,c）
'use client';

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FiArrowLeft, FiLoader } from 'react-icons/fi';
import { useI18n } from '../../components/I18nProvider';
import { useAuth } from '../../components/AuthProvider';
import { StakeholderGapMatrix } from '../../components/StakeholderGapMatrix';
import { useReportHistory, ReportDetail } from '@/hooks/useReportHistory';
import { MAX_COMPARE_REPORTS, MIN_COMPARE_REPORTS, buildGapMatrix } from '@/lib/stakeholder-gap';

const TEXTS = {
  ja: {
    title: 'ステークホルダ間ギャップ行列',
    description:
      '同じ文書から作った複数のレポートで、GSNノード・リスクがどの読者に、どの深さで伝わっているかを比較します。',
    backToHistory: '履歴一覧に戻る',
    loading: 'レポートを読み込み中...',
    loginRequired: 'ギャップ行列を見るにはログインしてください',
    tooFew: `比較するレポートを${MIN_COMPARE_REPORTS}〜${MAX_COMPARE_REPORTS}件選んでください。`,
    notFound: (n: number) => `${n}件のレポートを読み込めませんでした。`,
    noData:
      '選んだレポートにヒートマップのデータがありません（GSNノード・リスクのヒートマップを含めて生成したレポートで比較できます）。',
  },
  en: {
    title: 'Stakeholder Gap Matrix',
    description:
      'Compare how each GSN node and risk is conveyed, and at what depth, across reports generated from the same documents for different readers.',
    backToHistory: 'Back to History',
    loading: 'Loading reports...',
    loginRequired: 'Please login to view the gap matrix',
    tooFew: `Select ${MIN_COMPARE_REPORTS}-${MAX_COMPARE_REPORTS} reports to compare.`,
    notFound: (n: number) => `Failed to load ${n} report(s).`,
    noData:
      'The selected reports have no heatmap data (compare reports generated with GSN node / risk heatmaps).',
  },
};

function formatShortDate(dateString: string, language: 'ja' | 'en') {
  return new Date(dateString).toLocaleString(language === 'en' ? 'en-US' : 'ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CompareContent() {
  const { language } = useI18n();
  const t = TEXTS[language];
  const { status: authStatus } = useAuth();
  const { getReport } = useReportHistory();
  const searchParams = useSearchParams();
  const idsParam = searchParams.get('ids') ?? '';
  const ids = useMemo(
    () => [...new Set(idsParam.split(',').map((id) => id.trim()).filter(Boolean))],
    [idsParam]
  );
  const validCount = ids.length >= MIN_COMPARE_REPORTS && ids.length <= MAX_COMPARE_REPORTS;

  const [reports, setReports] = useState<ReportDetail[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !validCount) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    Promise.all(ids.map((id) => getReport(id))).then((results) => {
      if (cancelled) return;
      setReports(results.filter((r): r is ReportDetail => r !== null));
      setFailedCount(results.filter((r) => r === null).length);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authStatus, ids, validCount, getReport]);

  const matrix = useMemo(() => {
    if (reports.length < MIN_COMPARE_REPORTS) return null;
    // 同じステークホルダのレポートが複数あれば日時で見分けられるようにする
    const roleCounts = new Map<string, number>();
    for (const r of reports) roleCounts.set(r.stakeholder.role, (roleCounts.get(r.stakeholder.role) ?? 0) + 1);
    return buildGapMatrix(
      reports.map((r) => ({
        reportId: r.reportId,
        label:
          (roleCounts.get(r.stakeholder.role) ?? 0) > 1
            ? `${r.stakeholder.role} (${formatShortDate(r.createdAt, language)})`
            : r.stakeholder.role,
        content: r.content,
        createdAt: r.createdAt,
        fileNames: r.files?.map((f) => f.name),
      })),
      language
    );
  }, [reports, language]);

  let body: ReactNode;
  if (authStatus === 'unauthenticated') {
    body = <p className="text-gray-600 dark:text-gray-400">{t.loginRequired}</p>;
  } else if (!validCount) {
    body = <p className="text-gray-600 dark:text-gray-400">{t.tooFew}</p>;
  } else if (isLoading || authStatus === 'loading') {
    body = (
      <div className="flex h-64 items-center justify-center">
        <FiLoader className="animate-spin text-gray-400" size={32} />
        <span className="ml-3 text-gray-500">{t.loading}</span>
      </div>
    );
  } else if (!matrix) {
    body = <p className="text-gray-600 dark:text-gray-400">{failedCount > 0 ? t.notFound(failedCount) : t.tooFew}</p>;
  } else {
    body = (
      <>
        {failedCount > 0 && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{t.notFound(failedCount)}</p>}
        {matrix.rows.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">{t.noData}</p>
        ) : (
          <StakeholderGapMatrix matrix={matrix} />
        )}
      </>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 dark:bg-gray-900 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/history"
          className="mb-6 inline-flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <FiArrowLeft className="mr-2" />
          {t.backToHistory}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.title}</h1>
        <p className="mb-6 mt-1 text-sm text-gray-500 dark:text-gray-400">{t.description}</p>
        {body}
      </div>
    </main>
  );
}

export default function ComparePage() {
  // useSearchParams はクライアント側でのみ確定するため Suspense で包む
  return (
    <Suspense fallback={null}>
      <CompareContent />
    </Suspense>
  );
}
