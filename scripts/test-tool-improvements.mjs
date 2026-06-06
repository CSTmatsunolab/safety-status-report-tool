#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);

function run(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    ...options,
  });
}

function valueForIndex(vector, index) {
  const position = vector.indices.indexOf(index);
  return position >= 0 ? vector.values[position] : 0;
}

function assertSparseVectorShape(vector) {
  assert.ok(Array.isArray(vector.indices), 'indices must be an array');
  assert.ok(Array.isArray(vector.values), 'values must be an array');
  assert.equal(vector.indices.length, vector.values.length, 'indices and values length must match');
  assert.ok(vector.indices.length > 0, 'sparse vector must not be empty');
  assert.deepEqual(
    [...vector.indices].sort((a, b) => a - b),
    vector.indices,
    'indices must be sorted for deterministic upsert/search'
  );
  assert.ok(vector.values.every(value => Number.isFinite(value) && value > 0), 'values must be finite and positive');
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function testBM25SparseVectors() {
  const sparse = require('../lambda/dist/lib/rag/sparse-vector-utils.js');
  const corpus = [
    'rareterm common common hazard H-001 safety evidence',
    'common common common safety risk H-002',
  ];

  const { vectors, stats } = await sparse.createBM25SparseVectorSet(corpus, {
    maxDimensions: 200,
  });

  assert.equal(vectors.length, corpus.length);
  assert.equal(stats.documentCount, corpus.length);
  assert.ok(stats.averageDocumentLength > 0);
  assert.ok(stats.uniqueTerms > 0);
  vectors.forEach(assertSparseVectorShape);

  const rareIndex = (await sparse.createSparseVectorLite('rareterm')).indices[0];
  const commonIndex = (await sparse.createSparseVectorLite('common')).indices[0];
  const rareValue = valueForIndex(vectors[0], rareIndex);
  const commonValue = valueForIndex(vectors[0], commonIndex);

  assert.ok(rareValue > 0, 'rare term must be present in the first BM25 vector');
  assert.ok(commonValue > 0, 'common term must be present in the first BM25 vector');
  assert.ok(rareValue > commonValue, 'BM25 IDF should weight the rarer term above the corpus-common term');
}

function testFullTextGSNDetection() {
  const fullText = require('../lambda/dist/lib/full-text-files.js');

  assert.equal(fullText.isGSNFile({ name: 'TEST_GSN_Structure.md' }), true);
  assert.equal(fullText.isGSNFile({ type: 'gsn' }), true);
  assert.equal(fullText.isGSNFile({ metadata: { userDesignatedGSN: true } }), true);
  assert.equal(fullText.shouldUseFullText({ type: 'gsn' }), true);
  assert.equal(fullText.shouldUseFullText({ name: 'ordinary.md' }), false);
  assert.equal(fullText.shouldUseFullText({ name: 'manual.md' }, ['manual.md']), true);
}

function testTraceability() {
  const traceability = require('../lambda/dist/lib/traceability.js');
  const source = traceability.buildFullTextSource(
    { name: 'Safety.md', type: 'other', metadata: {} },
    0,
    'H-001 mitigation is complete on 2026-02-01. Risk R-101 is controlled.',
    false
  );

  const context = traceability.formatTraceableContext([source], 'en');
  assert.match(context, /\[SRC-001\]/);
  assert.match(context, /H-001/);

  const result = traceability.analyzeReportTraceability(
    [
      'H-001 mitigation is complete.',
      'H-999 mitigation is complete [SRC-001].',
      'Risk R-101 is controlled [SRC-001].',
    ].join('\n'),
    [source]
  );

  assert.equal(result.sourceCount, 1);
  assert.deepEqual(result.citedSourceIds, ['SRC-001']);
  assert.equal(result.uncitedSourceIds.length, 0);
  assert.ok(result.issues.some(issue => issue.type === 'missing-citation'));
  assert.ok(result.issues.some(issue => issue.type === 'unknown-identifier' && issue.identifier === 'h-999'));
}

function testUserProvidedClaudeApiKeyFlow() {
  const page = readProjectFile('src/app/page.tsx');
  assert.match(page, /ANTHROPIC_API_KEY_STORAGE_KEY/, 'UI must persist the user-provided Claude API key locally');
  assert.match(page, /type="password"/, 'Claude API key input must be masked');
  assert.match(page, /anthropicApiKey:\s*anthropicApiKey\.trim\(\)/, 'UI must pass the trimmed key to report generation');

  const hook = readProjectFile('src/hooks/useSectionGeneration.ts');
  assert.match(hook, /anthropicApiKey\?: string/, 'generation hook must accept an optional Claude API key');
  assert.match(hook, /anthropicApiKey:\s*anthropicApiKey\?\.trim\(\) \|\| undefined/, 'generation hook must send the key only when provided');

  const localRoute = readProjectFile('src/app/api/generate-report-local/route.ts');
  assert.match(localRoute, /requestAnthropicApiKey \|\| process\.env\.ANTHROPIC_API_KEY/, 'local route must prefer the user key and fall back to the environment key');
  assert.match(localRoute, /apiKey:\s*effectiveAnthropicApiKey/, 'local route must initialize Claude with the effective key');

  const lambdaTypes = readProjectFile('lambda/src/types.ts');
  assert.match(lambdaTypes, /anthropicApiKey\?: string/, 'Lambda request type must allow an optional Claude API key');

  const lambdaIndex = readProjectFile('lambda/src/index.ts');
  assert.match(lambdaIndex, /resolveAnthropicApiKey\(requestAnthropicApiKey\)/, 'Lambda must resolve the user-provided Claude API key');
  assert.match(lambdaIndex, /apiKey:\s*effectiveAnthropicApiKey/, 'Lambda must initialize Claude with the effective key');
}

async function main() {
  run('npm', ['run', 'build', '--prefix', 'lambda']);

  await testBM25SparseVectors();
  testFullTextGSNDetection();
  testTraceability();
  testUserProvidedClaudeApiKeyFlow();

  run('node', ['evaluation/rag-evaluation/reproduce-paper-tables.mjs', '--check']);

  console.log('\nAll tool-improvement tests passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
