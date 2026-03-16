# Evaluation

Evaluation scripts and data for the stakeholder-adaptive safety report generation framework.

- **RAG Retrieval Evaluation** — Measures how well adaptive retrieval selects relevant chunks for each stakeholder role.
- **SSR Quality Evaluation** — Assesses generated Safety Status Report quality via LLM-as-a-Judge and expert human evaluation.

## Directory Structure

```
evaluation/
├── README.md
├── rag-evaluation/                          ← RAG retrieval evaluation
│   ├── rag-evaluator.ts                     # Main CLI script
│   ├── rag-utils-copy.ts                    # Dynamic K, RRF weights, baseline config
│   ├── metrics.ts                           # IR metrics (P@K, R@K, F1, nDCG, MRR)
│   ├── csv-exporter.ts                      # CSV export & Ground Truth conversion
│   ├── types.ts                             # Type definitions
│   ├── lib/
│   │   └── query-enhancer/                  # Role-aware query expansion
│   ├── stakeholders-all.json                # 6 stakeholder role definitions
│   ├── rag-priority-mapping.xlsx            # Document-level relevance ratings (◎○△−)
│   ├── all-chunks-all.csv                   # All 58 chunks with relevance labels
│   ├── ground-truth-p1.json                 # Broad Relevance (score ≥ 1)
│   ├── ground-truth-p2.json                 # Strict Relevance (score ≥ 2)
│   ├── evaluation-results/                  # Output directory
│   │   ├── 2026-02-28T03-23-53-212Z/        #   evaluate-rrf results (P1)
│   │   ├── 2026-02-28T03-28-24-817Z/        #   evaluate-rrf results (P2)
│   │   └── comparison-2026-03-04T01-46-45-346Z/  # evaluate-comparison results
│   ├── package.json
│   ├── package-lock.json
│   └── tsconfig.json
└── ssr-quality-eval/                        ← SSR generation quality evaluation
    ├── evaluate.py                          # LLM-as-a-Judge script
    ├── prompt_template.txt                  # Evaluation prompt template
    ├── stakeholders.json                    # Stakeholder definitions
    ├── requirements.txt                     # Python dependencies
    ├── inputs/                              # Source safety documents
    │   ├── TEST_GSN_Structure.md
    │   ├── TEST_Hazard_Analysis.md
    │   ├── TEST_Project_Status.md
    │   ├── TEST_Risk_Summary.md
    │   ├── TEST_Safety_Requirements.md
    │   └── TEST_Verification_Results.md
    ├── outputs/                             # Generated SSR reports (6 roles)
    │   ├── CxO _ 経営層向け Safety Status Report.md
    │   ├── Technical Fellows _ 技術専門家向け Safety Status Report.md
    │   ├── Architect _ アーキテクト向け Safety Status Report.md
    │   ├── Business Division _ 事業部門向け Safety Status Report.md
    │   ├── Product Division _ 製品部門向け Safety Status Report.md
    │   └── R&D Division _ 研究開発部門向け Safety Status Report.md
    └── results/                             # LLM judge scores
        ├── eval_gemini_20260207_152600_v4.json
        ├── eval_gpt5_20260207_151252_v4.json
        └── eval_deepseek_20260207_151645_v4.json
```

---

## Setup

### RAG Evaluation

```bash
cd rag-evaluation
npm install
```

Create `rag-evaluation/.env.local`:

```
PINECONE_API_KEY=your-key
OPENAI_API_KEY=your-key
PINECONE_INDEX_NAME=ssr-knowledge-base
```

### SSR Quality Evaluation

```bash
cd ssr-quality-eval
python -m venv venv
source venv/bin/activate    # macOS/Linux
# venv\Scripts\activate     # Windows
pip install -r requirements.txt
```

API keys are required for each judge model (Gemini, GPT, DeepSeek). Set them as environment variables according to `evaluate.py`.

---

## Part 1: RAG Retrieval Evaluation

### Corpus

| Category | Files | Chunks | Purpose |
|----------|-------|--------|---------|
| Safety documents | 5 (TEST_*.md) | 25 | Relevant content |
| Noise documents | 8 (NOISE_*.md) | 33 | Distractors |
| **Total** | **13** | **N = 58** | Per stakeholder namespace |

The GSN model (`TEST_GSN_Structure.md`) is passed in full to the generation LLM and is not part of the retrieval index.

### Relevance Annotation

| Score | Symbol | Meaning | Broad (P1) | Strict (P2) |
|-------|--------|---------|-------------|--------------|
| 3 | ◎ | Essential | ✅ Relevant | ✅ Relevant |
| 2 | ○ | Important | ✅ Relevant | ✅ Relevant |
| 1 | △ | Background | ✅ Relevant | ❌ Excluded |
| 0 | — | Irrelevant | ❌ Excluded | ❌ Excluded |

Document-level ratings are defined in `rag-priority-mapping.xlsx` and propagated to chunks via `export-all-csv`.

### Adaptive vs Non-Adaptive Baseline

| Component | Adaptive | Non-Adaptive Baseline |
|-----------|----------|----------------------|
| Query generation | Role-specific (CustomStakeholderQueryEnhancer) | 6 generic safety queries |
| K-value | Dynamic: K = min(K_max, max(K_min, ⌈N × r⌉)) | Fixed ratio r_base = 0.40 |
| RRF weights | Role-specific (tech: 1st=1.5×, business: top2=1.2×) | Uniform (all 1.0) |

### Commands

All commands are run from `rag-evaluation/`.

**Step 1: Export all chunks to CSV (for labeling)**

```bash
npx ts-node rag-evaluator.ts export-all-csv \
  --uuid "<your-uuid>" \
  --output ./all-chunks-all.csv \
  --stakeholders "cxo,technical-fellows,architect,product,business,r-and-d"
```

Reads `rag-priority-mapping.xlsx` automatically. Review and adjust relevance scores in Excel.

**Step 2: Convert labeled CSV to Ground Truth**

```bash
# Broad Relevance (score ≥ 1)
npx ts-node rag-evaluator.ts convert-all-csv \
  --input ./all-chunks-all.csv \
  --uuid "<your-uuid>" \
  --output ./ground-truth-p1.json \
  --pattern 1

# Strict Relevance (score ≥ 2)
npx ts-node rag-evaluator.ts convert-all-csv \
  --input ./all-chunks-all.csv \
  --uuid "<your-uuid>" \
  --output ./ground-truth-p2.json \
  --pattern 2
```

**Step 3: Evaluate Adaptive retrieval (Broad Relevance)**

```bash
npx ts-node rag-evaluator.ts evaluate-rrf \
  --uuid "<your-uuid>" \
  --stakeholders ./stakeholders-all.json \
  --ground-truth ./ground-truth-p1.json
```

**Step 4: Compare Adaptive vs Non-Adaptive (Strict Relevance)**

```bash
npx ts-node rag-evaluator.ts evaluate-comparison \
  --uuid "<your-uuid>" \
  --stakeholders ./stakeholders-all.json \
  --ground-truth ./ground-truth-p2.json
```

Output:
```
evaluation-results/comparison-{timestamp}/
├── comparison-result-{timestamp}.json      # Comparison data
├── comparison-report-{timestamp}.txt       # Comparison table (text)
├── adaptive-result-{timestamp}.json        # Adaptive detail
└── non-adaptive-result-{timestamp}.json    # Non-Adaptive detail
```

**Utility: View generated queries**

```bash
npx ts-node rag-evaluator.ts show-queries \
  --stakeholders ./stakeholders-all.json
```

### Metrics

| Metric | Description |
|--------|-------------|
| Precision@K | Fraction of retrieved K chunks that are relevant |
| Recall@K | Fraction of all relevant chunks retrieved in top K |
| F1@K | Harmonic mean of Precision and Recall |
| MRR | Reciprocal rank of the first relevant chunk |
| nDCG@K | Ranking quality score (uses graded relevance 1–3) |
| Coverage | Fraction of source files represented in results |

---

## Part 2: SSR Quality Evaluation

### Overview

Generated Safety Status Reports (in `outputs/`) are scored on nine quality dimensions using a five-point Likert scale.

| # | Dimension | What it measures |
|---|-----------|-----------------|
| 1 | Faithfulness | No hallucination; grounded in source documents |
| 2 | Consistency | No internal contradictions |
| 3 | Coherence | Logical structure and flow |
| 4 | Answer Relevance | Addresses the stakeholder's instructions |
| 5 | Fluency | Natural, grammatically correct language |
| 6 | Relevance | Covers key points without redundancy |
| 7-1 | Informativeness | Information needed for stakeholder decision-making |
| 7-2 | Simplification | Appropriate technical depth for the audience |
| 8 | GSN Alignment | Coverage of GSN node explanations |

### LLM-as-a-Judge

Three judge models (all distinct from the generation model):

- Gemini 2.5 Flash
- GPT-5.2 Thinking
- DeepSeek v3.2

```bash
cd ssr-quality-eval
source venv/bin/activate
python evaluate.py
```

Results are saved to `results/` as JSON files per model.

### Expert Human Evaluation

Four safety professionals evaluated reports for CxO, Technical Fellows, and Product Division using the same nine dimensions and five-point Likert scale via a Google Forms questionnaire.

---

## Quick Reproduction

```bash
# 1. RAG: Broad Relevance
cd rag-evaluation
npx ts-node rag-evaluator.ts evaluate-rrf \
  --uuid "<your-uuid>" \
  --stakeholders ./stakeholders-all.json \
  --ground-truth ./ground-truth-p1.json

# 2. RAG: Adaptive vs Non-Adaptive
npx ts-node rag-evaluator.ts evaluate-comparison \
  --uuid "<your-uuid>" \
  --stakeholders ./stakeholders-all.json \
  --ground-truth ./ground-truth-p2.json

# 3. SSR Quality: LLM-as-a-Judge
cd ../ssr-quality-eval
source venv/bin/activate
python evaluate.py
```

RAG results may show minor score variations across runs due to embedding API non-determinism.