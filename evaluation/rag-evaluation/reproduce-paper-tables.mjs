#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const DEFAULT_MANIFEST = path.join(SCRIPT_DIR, 'paper-evaluation-manifest.json');
const DEFAULT_OUTPUT_DIR = path.join(SCRIPT_DIR, 'paper-tables');

function getArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveFromScriptDir(relativePath) {
  return path.isAbsolute(relativePath)
    ? relativePath
    : path.join(SCRIPT_DIR, relativePath);
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function percent(value, digits = 1) {
  return Number((value * 100).toFixed(digits));
}

function summarizeEvaluationReport(report) {
  const rows = report.queryResults.map(result => ({
    stakeholderId: result.stakeholderId,
    precision: result.metrics.precisionAtK,
    recall: result.metrics.recallAtK,
    f1: result.metrics.f1AtK,
    ndcg: result.metrics.ndcgAtK,
    k: result.retrievedChunks.length,
  }));

  return {
    timestamp: report.timestamp,
    config: report.config,
    summary: report.summary,
    rows,
  };
}

function summarizeComparison(comparison, adaptiveReport, nonAdaptiveReport) {
  return {
    timestamp: comparison.timestamp,
    groundTruthVersion: comparison.groundTruthVersion,
    uuid: comparison.uuid,
    adaptiveSummary: adaptiveReport.summary,
    nonAdaptiveSummary: nonAdaptiveReport.summary,
    rows: comparison.stakeholderResults.map(result => ({
      stakeholderId: result.stakeholderId,
      stakeholderRole: result.stakeholderRole,
      adaptive: result.adaptive.metrics,
      nonAdaptive: result.nonAdaptive.metrics,
      delta: result.delta,
      adaptiveK: result.adaptive.k,
      nonAdaptiveK: result.nonAdaptive.k,
    })),
  };
}

function makeBroadMarkdown(broad) {
  const lines = [
    '| Stakeholder | K | Precision (%) | Recall (%) | F1 (%) | nDCG |',
    '|---|---:|---:|---:|---:|---:|',
  ];

  for (const row of broad.rows) {
    lines.push(`| ${row.stakeholderId} | ${row.k} | ${percent(row.precision)} | ${percent(row.recall)} | ${percent(row.f1)} | ${round(row.ndcg, 3)} |`);
  }

  lines.push(`| Avg | - | ${percent(broad.summary.avgPrecisionAtK)} | ${percent(broad.summary.avgRecallAtK)} | ${percent(broad.summary.avgF1AtK)} | ${round(broad.summary.avgNdcgAtK, 3)} |`);
  return lines.join('\n');
}

function makeComparisonMarkdown(comparison) {
  const lines = [
    '| Stakeholder | Adaptive P/R/F1/nDCG | Non-adaptive P/R/F1/nDCG | Delta F1 | Delta nDCG |',
    '|---|---:|---:|---:|---:|',
  ];

  for (const row of comparison.rows) {
    const adaptive = `${percent(row.adaptive.precisionAtK)}/${percent(row.adaptive.recallAtK)}/${percent(row.adaptive.f1AtK)}/${round(row.adaptive.ndcgAtK, 3)}`;
    const nonAdaptive = `${percent(row.nonAdaptive.precisionAtK)}/${percent(row.nonAdaptive.recallAtK)}/${percent(row.nonAdaptive.f1AtK)}/${round(row.nonAdaptive.ndcgAtK, 3)}`;
    lines.push(`| ${row.stakeholderId} | ${adaptive} | ${nonAdaptive} | ${percent(row.delta.f1AtK)} | ${round(row.delta.ndcgAtK, 3)} |`);
  }

  const adaptiveAvg = comparison.adaptiveSummary;
  const nonAdaptiveAvg = comparison.nonAdaptiveSummary;
  lines.push(`| Avg | ${percent(adaptiveAvg.avgPrecisionAtK)}/${percent(adaptiveAvg.avgRecallAtK)}/${percent(adaptiveAvg.avgF1AtK)}/${round(adaptiveAvg.avgNdcgAtK, 3)} | ${percent(nonAdaptiveAvg.avgPrecisionAtK)}/${percent(nonAdaptiveAvg.avgRecallAtK)}/${percent(nonAdaptiveAvg.avgF1AtK)}/${round(nonAdaptiveAvg.avgNdcgAtK, 3)} | ${percent(adaptiveAvg.avgF1AtK - nonAdaptiveAvg.avgF1AtK)} | ${round(adaptiveAvg.avgNdcgAtK - nonAdaptiveAvg.avgNdcgAtK, 3)} |`);

  return lines.join('\n');
}

function metricMismatches(actual, expected, label, tolerance) {
  const mismatches = [];
  for (const [key, expectedValue] of Object.entries(expected || {})) {
    const actualValue = actual[key];
    if (typeof actualValue !== 'number') {
      mismatches.push(`${label}.${key}: actual value is missing`);
      continue;
    }
    if (Math.abs(actualValue - expectedValue) > tolerance) {
      mismatches.push(`${label}.${key}: expected ${expectedValue}, actual ${actualValue}`);
    }
  }
  return mismatches;
}

function writeOutputs(outputDir, summary) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'paper-evaluation-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(outputDir, 'broad-relevance-table.md'),
    makeBroadMarkdown(summary.broad),
    'utf8'
  );
  fs.writeFileSync(
    path.join(outputDir, 'strict-comparison-table.md'),
    makeComparisonMarkdown(summary.strictComparison),
    'utf8'
  );
}

function main() {
  const manifestPath = path.resolve(getArg('--manifest', DEFAULT_MANIFEST));
  const outputDir = path.resolve(getArg('--output-dir', DEFAULT_OUTPUT_DIR));
  const checkOnly = hasFlag('--check');
  const noWrite = hasFlag('--no-write') || checkOnly;

  const manifest = readJson(manifestPath);
  const tolerance = manifest.tolerance ?? 1e-9;

  const broadReport = readJson(resolveFromScriptDir(manifest.broad.resultPath));
  const comparison = readJson(resolveFromScriptDir(manifest.strictComparison.comparisonPath));
  const adaptiveReport = readJson(resolveFromScriptDir(manifest.strictComparison.adaptivePath));
  const nonAdaptiveReport = readJson(resolveFromScriptDir(manifest.strictComparison.nonAdaptivePath));

  const summary = {
    manifestVersion: manifest.version,
    generatedAt: new Date().toISOString(),
    broad: summarizeEvaluationReport(broadReport),
    strictComparison: summarizeComparison(comparison, adaptiveReport, nonAdaptiveReport),
  };

  const mismatches = [
    ...metricMismatches(
      summary.broad.summary,
      manifest.broad.expectedSummary,
      'broad.summary',
      tolerance
    ),
    ...metricMismatches(
      summary.strictComparison.adaptiveSummary,
      manifest.strictComparison.expectedAdaptiveSummary,
      'strictComparison.adaptiveSummary',
      tolerance
    ),
    ...metricMismatches(
      summary.strictComparison.nonAdaptiveSummary,
      manifest.strictComparison.expectedNonAdaptiveSummary,
      'strictComparison.nonAdaptiveSummary',
      tolerance
    ),
  ];

  if (mismatches.length > 0) {
    console.error('Evaluation artifact check failed:');
    for (const mismatch of mismatches) {
      console.error(`- ${mismatch}`);
    }
    process.exit(1);
  }

  if (!noWrite) {
    writeOutputs(outputDir, summary);
    console.log(`Paper evaluation tables written to ${outputDir}`);
  }

  console.log('Evaluation artifacts match the pinned manifest.');
  console.log(`Broad avg nDCG: ${summary.broad.summary.avgNdcgAtK.toFixed(4)}`);
  console.log(`Strict adaptive avg nDCG: ${summary.strictComparison.adaptiveSummary.avgNdcgAtK.toFixed(4)}`);
  console.log(`Strict non-adaptive avg nDCG: ${summary.strictComparison.nonAdaptiveSummary.avgNdcgAtK.toFixed(4)}`);
}

main();
