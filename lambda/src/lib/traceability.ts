// lambda/src/lib/traceability.ts
import { UploadedFile } from '../types';
import { DocumentWithScore } from './rag/types';

export interface TraceableSource {
  sourceId: string;
  kind: 'full-text' | 'rag-chunk';
  fileName: string;
  content: string;
  chunkId?: string;
  chunkIndex?: number | string;
  sectionHeading?: string;
  sectionLevel?: number | string;
  containedIds?: string[];
  isGSN?: boolean;
  rrfScore?: number;
  truncated?: boolean;
}

export interface TraceabilityIssue {
  type: 'missing-citation' | 'unknown-identifier';
  message: string;
  excerpt: string;
  identifier?: string;
}

export interface TraceabilityCheckResult {
  sourceCount: number;
  citedSourceIds: string[];
  uncitedSourceIds: string[];
  citationCoverage: number;
  factLikeLineCount: number;
  issues: TraceabilityIssue[];
}

function sourceId(index: number): string {
  return `SRC-${String(index + 1).padStart(3, '0')}`;
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  return [];
}

export function buildFullTextSource(
  file: UploadedFile,
  index: number,
  content: string,
  truncated: boolean
): TraceableSource {
  return {
    sourceId: sourceId(index),
    kind: 'full-text',
    fileName: file.name,
    content,
    isGSN: Boolean(file.isGSN || file.type === 'gsn' || file.metadata?.isGSN || file.metadata?.userDesignatedGSN),
    truncated,
  };
}

export function buildRagSources(
  documents: DocumentWithScore[],
  startIndex: number
): TraceableSource[] {
  return documents.map((document, offset) => {
    const metadata = document.metadata || {};
    return {
      sourceId: sourceId(startIndex + offset),
      kind: 'rag-chunk',
      fileName: (metadata.fileName as string) || 'unknown',
      content: document.content,
      chunkId: document.id,
      chunkIndex: metadata.chunkIndex as number | string | undefined,
      sectionHeading: metadata.sectionHeading as string | undefined,
      sectionLevel: metadata.sectionLevel as number | string | undefined,
      containedIds: coerceStringArray(metadata.containedIds),
      isGSN: Boolean(metadata.isGSN),
      rrfScore: document.rrfScore,
    };
  });
}

function formatSourceLine(source: TraceableSource): string {
  const details = [
    `file=${source.fileName}`,
    `kind=${source.kind}`,
    source.chunkIndex !== undefined ? `chunk=${source.chunkIndex}` : undefined,
    source.sectionHeading ? `section=${source.sectionHeading}` : undefined,
    source.containedIds && source.containedIds.length > 0 ? `ids=${source.containedIds.join(',')}` : undefined,
    source.isGSN ? 'gsn=true' : undefined,
  ].filter(Boolean);

  return `- [${source.sourceId}] ${details.join(' | ')}`;
}

export function formatTraceableContext(
  sources: TraceableSource[],
  language: 'ja' | 'en'
): string {
  const sourceMap = sources.map(formatSourceLine).join('\n');
  const citationInstruction = language === 'en'
    ? [
        'Use the source IDs exactly as shown, e.g. [SRC-001].',
        'Every numerical value, date, ID, risk status, test result, causal statement, and concrete factual claim must cite at least one source ID.',
        'If a claim cannot be tied to a source ID, write "[NOT DOCUMENTED]" or "[TO BE CONFIRMED]" instead of inventing content.',
      ].join('\n')
    : [
        '出典IDは [SRC-001] の形式でそのまま使用すること。',
        '数値、日付、ID、リスク状態、テスト結果、因果関係、具体的な事実主張には、必ず1つ以上の出典IDを付けること。',
        '出典IDに紐づけられない主張は創作せず、「【文書記載なし】」または「【要確認】」と記載すること。',
      ].join('\n');

  const sourceContents = sources.map(source => {
    const header = [
      `=== Source ID: [${source.sourceId}]`,
      `File: ${source.fileName}`,
      `Kind: ${source.kind}`,
      source.chunkId ? `Chunk ID: ${source.chunkId}` : undefined,
      source.sectionHeading ? `Section: ${source.sectionHeading}` : undefined,
      source.containedIds && source.containedIds.length > 0 ? `Contained IDs: ${source.containedIds.join(', ')}` : undefined,
      source.isGSN ? 'GSN: true' : undefined,
      '===',
    ].filter(Boolean).join(' | ');

    return `${header}\n\n${source.content}`;
  }).join('\n\n---\n\n');

  return [
    language === 'en' ? '## SOURCE REFERENCE MAP' : '## 出典IDマップ',
    sourceMap,
    '',
    language === 'en' ? '## CITATION REQUIREMENTS' : '## 出典記載ルール',
    citationInstruction,
    '',
    language === 'en' ? '## SOURCE CONTENTS' : '## 出典本文',
    sourceContents,
  ].join('\n');
}

function splitReportLines(report: string): string[] {
  return report
    .split(/\n|(?<=[。.!?])\s+/)
    .map(line => line.trim())
    .filter(Boolean);
}

function isIgnorableLine(line: string): boolean {
  return Boolean(
    /^#{1,6}\s/.test(line) ||
    /^\|?[-:\s|]+\|?$/.test(line) ||
    /^[-*]\s*$/.test(line) ||
    /^(出典|source|references?|参考文献)/i.test(line)
  );
}

function hasSourceCitation(line: string): boolean {
  return /\[SRC-\d{3}\]/.test(line);
}

function isFactLikeLine(line: string): boolean {
  if (line.length < 12 || isIgnorableLine(line)) return false;
  if (/【文書記載なし】|【要確認】|【原因不明】|\[NOT DOCUMENTED\]|\[TO BE CONFIRMED\]|\[CAUSE UNKNOWN\]/.test(line)) {
    return false;
  }

  const containsNumberOrId = /(\d{4}-\d{2}-\d{2}|\d+(?:\.\d+)?\s*%?|(?:Sn|[GSCJEAM])\d+|[A-Z]{1,5}-\d{1,5})/i.test(line);
  const japaneseAssertion = /(である|した|された|完了|未完了|合格|不合格|重大|深刻|安全|リスク|ハザード|対策|原因|検証)/.test(line);
  const englishAssertion = /\b(is|are|was|were|completed|failed|passed|critical|major|risk|hazard|safe|unsafe|because|due to|cause|mitigation)\b/i.test(line);

  return containsNumberOrId || japaneseAssertion || englishAssertion;
}

function extractIdentifiers(text: string): string[] {
  const matches = text.match(/\b(?:Sn\d+|[GSCJEAM]\d+|[A-Z]{1,5}-\d{1,5}|ISO\s?\d+(?:-\d+)*|IEC\s?\d+(?:-\d+)*)\b/gi) || [];
  return [...new Set(matches.map(match => match.toLowerCase()))]
    .filter(identifier => !/^src-\d+$/.test(identifier));
}

export function analyzeReportTraceability(
  report: string,
  sources: TraceableSource[]
): TraceabilityCheckResult {
  const sourceIds = sources.map(source => source.sourceId);
  const citedSourceIds = [...new Set((report.match(/\[SRC-\d{3}\]/g) || [])
    .map(match => match.replace(/[\[\]]/g, '')))
    .values()]
    .filter(id => sourceIds.includes(id));
  const uncitedSourceIds = sourceIds.filter(id => !citedSourceIds.includes(id));
  const sourceCorpus = sources.map(source => source.content).join('\n').toLowerCase();

  const issues: TraceabilityIssue[] = [];
  let factLikeLineCount = 0;

  for (const line of splitReportLines(report)) {
    if (isFactLikeLine(line)) {
      factLikeLineCount += 1;
      if (!hasSourceCitation(line) && issues.length < 25) {
        issues.push({
          type: 'missing-citation',
          message: 'Fact-like statement has no source ID citation.',
          excerpt: line.slice(0, 240),
        });
      }
    }

    for (const identifier of extractIdentifiers(line)) {
      if (!sourceCorpus.includes(identifier) && issues.length < 40) {
        issues.push({
          type: 'unknown-identifier',
          message: 'Identifier appears in the report but not in the provided sources.',
          excerpt: line.slice(0, 240),
          identifier,
        });
      }
    }
  }

  return {
    sourceCount: sourceIds.length,
    citedSourceIds,
    uncitedSourceIds,
    citationCoverage: sourceIds.length === 0 ? 0 : citedSourceIds.length / sourceIds.length,
    factLikeLineCount,
    issues,
  };
}
