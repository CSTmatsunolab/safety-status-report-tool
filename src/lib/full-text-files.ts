// src/lib/full-text-files.ts
type FullTextCandidate = {
  name?: string;
  type?: string;
  includeFullText?: boolean;
  useFullText?: boolean;
  isGSN?: boolean;
  metadata?: {
    isGSN?: boolean;
    userDesignatedGSN?: boolean;
    [key: string]: unknown;
  };
};

export function isGSNFile(file: FullTextCandidate): boolean {
  const fileName = file.name || '';
  return Boolean(
    file.type === 'gsn' ||
    file.isGSN ||
    file.metadata?.isGSN ||
    file.metadata?.userDesignatedGSN ||
    /(^|[^a-z0-9])gsn([^a-z0-9]|$)/i.test(fileName) ||
    /d[-_ ]?case/i.test(fileName) ||
    /assurance[-_ ]?case/i.test(fileName)
  );
}

export function shouldUseFullText(
  file: FullTextCandidate,
  fullTextFileIds: string[] = []
): boolean {
  return Boolean(
    fullTextFileIds.includes(file.name || '') ||
    file.includeFullText ||
    file.useFullText ||
    isGSNFile(file)
  );
}
