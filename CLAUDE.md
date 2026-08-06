# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Next.js web app that generates stakeholder-specific Safety Status Reports (SSRs) from GSN (Goal Structuring Notation) files and safety documents, using RAG + Claude. The core research idea is "Audience Design": retrieval depth, granularity, and rhetorical strategy are all adapted to *who* is reading the report (CxO, Architect, R&D, etc.), not just what's in the documents.

The repo has two deployable halves that must be built/deployed independently:
- **`src/`** — Next.js 15 (App Router) frontend + API routes. Runs on AWS Amplify.
- **`lambda/`** — a separate AWS Lambda (Node/TypeScript project, its own `package.json`/`tsconfig.json`) that does the actual RAG search + Claude streaming generation. This is a **distinct build** from the Next.js app — editing files under `lambda/src` has no effect until you `cd lambda && sam build && sam deploy`.

There's also `evaluation/` (two independent evaluation projects, own deps) — not part of the runtime app.

## Commands

### Frontend (repo root)
```bash
npm run dev      # start dev server (localhost:3000)
npm run build    # production build
npm start        # run production build
npm run lint     # next lint
```
No test runner is configured at the root.

### Lambda (`lambda/`)
```bash
cd lambda
npm install
npm run build       # tsc compile only (src/ -> dist/)
sam build           # required before every deploy if TS source changed
sam deploy --guided # first deploy (interactive)
sam deploy          # subsequent deploys
```
`sam deploy` alone does **not** pick up TypeScript changes — always `sam build` first. After deploying, copy the printed Lambda Function URL into `NEXT_PUBLIC_LAMBDA_FUNCTION_URL` in `.env.local`.

Local Lambda testing (requires Docker): `sam local invoke SSRGeneratorFunction -e events/test-event.json`.

### Evaluation (independent, own deps — see `evaluation/README.md`)
```bash
# RAG retrieval quality (rag-evaluation/, npm project)
cd evaluation/rag-evaluation && npm install
npx ts-node rag-evaluator.ts evaluate-rrf --uuid "<uuid>" --stakeholders ./stakeholders-all.json --ground-truth ./ground-truth-p1.json
npx ts-node rag-evaluator.ts evaluate-comparison --uuid "<uuid>" --stakeholders ./stakeholders-all.json --ground-truth ./ground-truth-p2.json

# SSR generation quality — LLM-as-a-Judge (ssr-quality-eval/, Python project)
cd evaluation/ssr-quality-eval && source venv/bin/activate
python evaluate.py
```

### Environment variables
Root `.env.local` needs `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `NEXT_PUBLIC_LAMBDA_FUNCTION_URL`, AWS S3 creds (`APP_AWS_*`), and optionally `GOOGLE_CLOUD_VISION_KEY` for OCR. Lambda env vars are separate — set via SAM parameters in `lambda/template.yaml` (`AnthropicApiKey`, `OpenAIApiKey`, `PineconeApiKey`, `PineconeIndexName`, `S3BucketName`), not `.env.local`.

## Architecture

### Request flow (report generation)
1. Frontend (`src/hooks/useSectionGeneration.ts`) POSTs to the Lambda Function URL, not a Next.js API route — generation itself bypasses `src/app/api` entirely.
2. Next.js API routes under `src/app/api/*` only handle document ingestion/knowledge-base management (upload, OCR, format extraction, S3, knowledge base build/delete, report history CRUD) — see `src/app/api/{build-knowledge-base,pdf-extract,docx-extract,excel-extract,google-vision-ocr,s3-upload,s3-process,s3-cleanup,delete-knowledge-base,list-knowledge-files,reports,user-settings}`.
3. `lambda/src/index.ts` is the actual generation handler (streaming, SSE via `awslambda.streamifyResponse`). Its flow:
   - Full-text files are read directly (bypass RAG) up to per-file/total char limits (`MAX_CONTENT_CHARS_PER_FILE` = 50,000, `MAX_TOTAL_CONTEXT_CHARS` = 150,000).
   - **If a GSN file is present**: `parseGSN` → `extractMandatorySafetyCore` → `generateStakeholderGSNView` → `performGSNSubtreeAwareSearch` (GSN-aware RAG) → outline is generated *from the GSN view* (`generateOutlineFromGSNView`), not from the static report-structure template. Any error here falls back silently to flat RAG.
   - **Otherwise**: `performAdaptiveRRFSearch` (flat stakeholder-adaptive RRF search) and the static section template from `reportStructure` is used, optionally with `gsnSections` spliced in (`buildFinalReportStructure`).
   - Prompt is built via `report-prompts.ts` (Japanese) / `report-prompts-en.ts` (English) — language is a hard fork, not a translation layer on top of one template.
   - Claude (`claude-sonnet-4-5-20250929`) streams the report body as SSE `chunk` events; a final `complete` event carries the assembled report + metadata.
4. Report history save/load goes through `src/app/api/reports` to DynamoDB + S3 (requires Cognito login).

### Stakeholder-adaptive RAG (the core research mechanism)
Three adaptation layers keyed on stakeholder role, all defined in `lambda/src/lib/rag/`:
- **Query expansion** — role-specific queries auto-generated from stakeholder concerns (`rag/query-enhancer/`, with per-role dictionaries in `dictionaries/`).
- **Dynamic K-value** — `K = min(K_max, max(K_min, ⌈N × r⌉))`, where `r` (reference ratio) and K bounds differ per stakeholder (CxO: r=0.25 → concise; R&D: r=0.60 → comprehensive). See table in README/`system_design.md`.
- **RRF weighting** — reciprocal rank fusion weights differ per role (e.g. technical roles upweight the first/most-specific query).

`rag/rrf-fusion.ts` implements both `performAdaptiveRRFSearch` (flat) and `performGSNSubtreeAwareSearch` (GSN-aware, adds GSN-node-derived queries at 1.5×/1.2× weight and folds in mandatory-core items). `rag/sparse-vector-utils.ts` builds BM25-style sparse vectors (Kuromoji for Japanese, WinkTokenizer for English) for hybrid search.

### GSN module (`lambda/src/lib/gsn/`)
This is the newer subsystem (see `GSN_STAKEHOLDER_VIEW_CHANGES.md` and `system_design.md` for the full design rationale — read these before modifying GSN behavior). Key files:
- `parser.ts` — parses GSN text (Markdown tables, tree notation like `G1 [Goal]`, open-issue sections, hazard text) into a `ParsedGSN` graph. Node type/status/severity/ASIL level are all inferred from ID patterns, bracket hints, and Japanese/English keywords — not from a rigid schema.
- `stakeholder-view.ts` — `STAKEHOLDER_GSN_CONFIGS` maps each stakeholder ID to a traversal depth + focused node types + abstraction level (e.g. `cxo`: depth 2, Goal/SubGoal/Strategy, executive; `r-and-d`: full depth, Solution/Evidence, detailed).
- `mandatory-core.ts` — extracts a **Mandatory Safety Core** (high-severity hazards, ASIL-C/D items, unverified requirements, open issues, failed verifications, critical assumptions) that must appear in *every* stakeholder's report regardless of their view's abstraction level. This exists specifically to prevent role-based filtering from hiding cross-cutting safety risks — do not let a stakeholder-view change accidentally bypass core merging (`mergeWithMandatoryCore`).
- `outline-generator.ts` — turns a `GSNView` into the report's section outline when a GSN file is present (replaces the static template from `report-structures.ts`).

If GSN parsing fails or no GSN file is provided, every one of these paths has a designed fallback to the pre-GSN flat behavior — preserve that fallback when changing this module.

### GSN structure display (frontend, `src/lib/gsn/` + `GSNStructureView.tsx`)
So the user can see what the Lambda will actually parse, `parser.ts`, `types.ts` and `extractMandatorySafetyCore` are **duplicated** into `src/lib/gsn/` (same manual-sync arrangement as `sparse-vector-utils.ts` — the two halves are independent builds). `src/lib/gsn/analyze.ts` adds display-only logic (tree building from `parentIds`/`childIds`, type/status counts, root counting) and `analyzeGSNFiles()` runs it over every uploaded file flagged as GSN; `src/app/components/GSNStructureView.tsx` renders the tree, the type/status summary, and the Mandatory Safety Core panel in the left column of `page.tsx`, and explains the flat-RAG fallback when no nodes are detected. **If you change `lambda/src/lib/gsn/parser.ts` or the core-extraction conditions, mirror the change into `src/lib/gsn/` or the UI will show a structure the report generator doesn't use.**

### Document ingestion pipeline (frontend, `src/lib/`)
`md-converter/` unifies DOCX/HTML/TXT/Excel/PDF into Markdown; then `chunking-strategies.ts` + `table-aware-chunking.ts` + `max-min-chunking.ts` do structure-aware chunking (split at headings, protect Markdown tables and safety IDs like `H-001`/`SR-101`, min 300 / max 1200 chars per section). `embeddings.ts` + `vector-store.ts` (Pinecone via `VectorStoreFactory`) build the knowledge base; `sparse-vector-utils.ts` exists in both `src/lib` and `lambda/src/lib/rag` (kept in sync manually — there's no shared package between the two builds).

### Stakeholders and report structures
`src/lib/stakeholders.ts` defines the 6 preset stakeholders (`cxo`, `technical-fellows`, `architect`, `business`, `product`, `r-and-d`) with parallel `_JA`/`_EN` definitions selected by `getPredefinedStakeholders(language)` — when adding a stakeholder concern or role text, update both language variants together. Custom stakeholders get K-values/weights inferred from keywords in the role name. `src/lib/report-structures.ts` defines the static section templates (including optional `gsnSections` spliced in when a GSN file is present).

### i18n
Two full locale files, `src/locales/ja.json` and `src/locales/en.json`, plus a hard language fork in the Lambda prompt builders (`report-prompts.ts` vs `report-prompts-en.ts`) and stakeholder definitions. There is no single source of truth to translate from — Japanese and English content are maintained as parallel artifacts throughout the stack, not derived from each other.
