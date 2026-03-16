# Safety Status Report (SSR) Generation Tool

A web application that leverages AI to automatically generate stakeholder-specific Safety Status Reports from GSN files and safety-related documents.

By introducing the sociolinguistic concept of "Audience Design" into RAG and LLM pipelines, the system dynamically optimizes information granularity and presentation style according to the reader's role.

## Key Features

### Document Processing
- Multiple file formats supported (PDF, DOCX, Markdown, CSV, Excel, HTML, text, images)
- OCR via Google Cloud Vision API (images and image-based PDFs)
- Structure-aware chunking (preserves headings, tables, and section boundaries)
- Unified Markdown conversion (DOCX/HTML/TXT → Markdown)
- Automatic detection and highlighting of safety IDs (H-001, SR-101, etc.)

### Knowledge Base & RAG Search
- Hybrid search (dense vectors + BM25 sparse vectors)
- Stakeholder-specific query expansion (6 queries auto-generated from role concerns)
- Reciprocal Rank Fusion (RRF) for ranking integration
- Dynamic K-value computation (automatic retrieval scope adjustment per role)
- Full-text inclusion option (pass important files directly to the LLM)

### Report Generation
- Stakeholder-specific reports (6 presets + custom stakeholders)
- Automatic rhetorical strategy selection (data-driven, logical reasoning, authority-based)
- GSN-aware report structure (automatic GSN analysis sections)
- Customizable report structures
- Streaming generation (real-time preview)

### Output & Management
- Multiple export formats (PDF, HTML, Word, Markdown)
- Japanese font support for PDF (Google Fonts)
- Report history (cloud storage, browsing, and re-export; login required)
- Bilingual support (Japanese / English)
- Dark mode

## Project Structure

```
safety-status-report-tool/
├── src/                        # Next.js frontend
│   ├── app/
│   │   ├── api/                #   API Routes (knowledge base, export, etc.)
│   │   ├── components/         #   UI components
│   │   ├── history/            #   Report history page
│   │   ├── stakeholder-settings/  # Stakeholder settings page
│   │   └── report-structure-settings/  # Report structure settings page
│   ├── hooks/                  # Custom hooks
│   ├── lib/                    # Business logic
│   │   ├── config/             #   Application settings
│   │   └── md-converter/       #   Markdown conversion module
│   ├── locales/                # i18n resources (ja.json, en.json)
│   └── types/                  # TypeScript type definitions
│
├── lambda/                     # AWS Lambda (report generation)
│   ├── src/
│   │   ├── index.ts            #   Main handler (streaming)
│   │   └── lib/
│   │       ├── rag/            #     RAG search, query expansion, RRF
│   │       ├── report-prompts.ts  #  Prompt templates
│   │       └── rhetoric-strategies.ts
│   ├── template.yaml           #   SAM template
│   └── README.md               #   Lambda-specific documentation
│
├── evaluation/                 # Evaluation scripts & data
│   ├── rag-evaluation/         #   RAG retrieval quality evaluation
│   ├── ssr-quality-eval/       #   SSR generation quality (LLM-as-a-Judge)
│   └── README.md               #   Full evaluation guide
│
├── docs/                       # Design documents
├── public/                     # Static files (help pages, etc.)
└── credentials/                # Credentials (.gitignore target)
```

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm
- API keys:
  - Anthropic Claude API (report generation)
  - OpenAI API (embeddings)
  - Pinecone (vector store)
  - Google Cloud Vision API (OCR, optional)
- AWS account:
  - AWS SAM CLI (Lambda deployment)
  - S3 bucket (large file handling)
  - Cognito User Pool (authentication, optional)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/CSTmatsunolab/safety-status-report-tool.git
cd safety-status-report-tool

# 2. Install dependencies
npm install

# Lambda
cd lambda
npm install
cd ..
```

### Environment Variables

Create `.env.local` in the project root:

```bash
# Required
ANTHROPIC_API_KEY=your_claude_api_key
OPENAI_API_KEY=your_openai_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=ssr-index

# Lambda Function URL (set after deployment)
NEXT_PUBLIC_LAMBDA_FUNCTION_URL=https://xxxxxxxx.lambda-url.ap-northeast-1.on.aws/

# OCR (optional)
GOOGLE_CLOUD_VISION_KEY='{ "type": "service_account", ... }'

# Chunking settings
USE_ADVANCED_CHUNKING=true
VECTOR_STORE=pinecone

# AWS S3
APP_AWS_REGION=your_region
APP_AWS_ACCESS_KEY_ID=your_access_key
APP_AWS_SECRET_ACCESS_KEY=your_secret_key
APP_AWS_S3_BUCKET_NAME=your_bucket_name

# S3 cleanup
CLEANUP_AUTH_TOKEN=your_secure_random_token
```

Lambda environment variables are configured in `lambda/template.yaml`. See [lambda/README.md](lambda/README.md) for details.

### Deploying the Lambda Function

```bash
cd lambda
sam build
sam deploy --guided   # first time
sam deploy            # subsequent deployments
```

Copy the output Function URL to `NEXT_PUBLIC_LAMBDA_FUNCTION_URL` in `.env.local`.

### Starting the Development Server

```bash
npm run dev
```

Open http://localhost:3000

### Production Build

```bash
npm run build
npm start
```

## Usage

### Basic Workflow

1. **Upload documents** — GSN files, safety requirements, hazard analyses, etc.
2. **Select a stakeholder** — Choose a preset (CxO, Technical Fellows, etc.) or custom role
3. **Choose a report structure** — Recommended or custom structure
4. **Build knowledge base** — Click "Build Knowledge Base"
5. **Generate report** — Click "Generate Report"
6. **Export** — Download as PDF / HTML / Word / Markdown
7. **Save to history** — After logging in, click "Save to History" for cloud storage

### Recommended File Formats

| Format | Structure Preservation | Recommendation | Notes |
|--------|----------------------|----------------|-------|
| Markdown (.md) | ◎ Excellent | ⭐⭐⭐ | Best choice; clear structure |
| Word (.docx) | ◎ Excellent | ⭐⭐⭐ | Tables and headings accurately recognized |
| CSV / Excel | ◎ Excellent | ⭐⭐⭐ | Ideal for tabular data |
| HTML (.html) | ○ Good | ⭐⭐ | For web page conversions |
| Text (.txt) | △ Partial | ⭐ | Tab-separated tables recognized |
| PDF (.pdf) | × Lost | Not recommended | Convert to DOCX/Markdown first |

### GSN Files

We recommend using text files exported via "Export LLM Input Text" in [D-Case Communicator](https://www.matsulab.org/dcase/login.html). When uploading, enable the following:
- **"GSN" checkbox ON** — Adds GSN analysis sections to the report structure
- **"Full Text" ON** — Recommended to preserve GSN structural relationships for the LLM

### Full-Text Inclusion

Each file has a "Full Text" toggle. When enabled, the entire file content is passed directly to the LLM, bypassing the knowledge base.

**Recommended for:**
- GSN files (structure matters)
- Numeric data (CSV, Excel, etc.)
- Small files (under 5,000 characters)
- Critical specification documents

**Limits:**
- Max 50,000 characters per file (excess is truncated)
- Max 150,000 characters total
- Files over 50,000 characters: up to 2 files can use full-text inclusion

### Custom Stakeholders

In addition to the 6 preset stakeholders, you can create custom ones. Go to Settings menu (≡) → "Stakeholder Settings":

| Field | Description | Example |
|-------|-------------|---------|
| Name | Display name | Risk Manager |
| Perspective keywords | Keywords of interest | risk, mitigation, ASIL |
| Expertise level | Expert / Non-expert | Expert |
| Reading time | Report length (minutes) | 5 min |
| Primary concerns | Priority reporting topics | Risk assessment and mitigation status |

Custom stakeholders are automatically assigned K-values and weights based on keywords in the role name.

### Custom Report Structures

Beyond preset structures, you can create your own. From the structure selector, click "Create Custom Structure" to add, edit, delete, and reorder sections.

### Report History

After logging in, generated reports can be saved to the cloud (AWS DynamoDB + S3). Access Settings menu → "Report History" to browse, sort, filter, and re-export saved reports.

Stored information: report body (Markdown), title, stakeholder, rhetorical strategy, creation date, and input file metadata.

## Architecture

### Stakeholder-Adaptive RAG

Retrieval is controlled through three adaptation layers based on stakeholder role:

| Layer | Description | Example |
|-------|-------------|---------|
| Query expansion | Auto-generates search queries from role concerns | CxO: ROI, cost, risk management |
| Dynamic K-value | Controls the number of retrieved chunks per role | CxO: 25%, R&D: 60% |
| RRF weights | Adjusts ranking based on query importance | Technical: 1st query = 1.5× |

### Dynamic K-Value Design

| Stakeholder | Ratio | Min K | Max K | Design Rationale |
|-------------|-------|-------|-------|-----------------|
| CxO | 25% | 15 | 50 | Concise, focused information |
| Business | 30% | 15 | 60 | Business impact focus |
| Product | 40% | 18 | 80 | Balance of quality and safety |
| Technical Fellows | 55% | 22 | 120 | Detailed technical information |
| Architect | 55% | 22 | 120 | Design integrity verification |
| R&D | 60% | 25 | 120 | Comprehensive technical evidence |

K-value formula: `K = min(K_max, max(K_min, ⌈N × r⌉))`

### Structure-Aware Chunking

Documents are processed through the following pipeline:

1. **Markdown conversion** — DOCX/HTML/TXT → unified Markdown
2. **Structure extraction** — Split at headings (#, ##, ###)
3. **Table protection** — Markdown tables kept as single chunks
4. **Max-Min chunking** — Large sections split at semantic boundaries

| Parameter | Value | Description |
|-----------|-------|-------------|
| MIN_SECTION_SIZE | 300 chars | Sections smaller than this are merged with the next |
| MAX_SECTION_SIZE | 1,200 chars | Sections larger than this are split via Max-Min |

Protected structures: Markdown tables, figure/table captions ("Table 1", "Figure 2", etc.), safety IDs (H-001, SR-101, etc. rendered in bold)

### Rhetorical Strategies

| Strategy | Target Stakeholders | Characteristics |
|----------|--------------------|----|
| Data-Driven | CxO, Business, Product | Persuasion through quantitative evidence |
| Logical Reasoning | Technical Fellows, Architect | Logical justification and traceability |
| Authority-Based | R&D | Arguments grounded in standards and technical literature |

## Evaluation

Evaluation scripts for RAG retrieval quality and SSR generation quality are located in the `evaluation/` directory. See [evaluation/README.md](evaluation/README.md) for details.

## Tech Stack

| Category | Technologies |
|----------|-------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| AI / LLM | Anthropic Claude API, OpenAI Embeddings, Google Cloud Vision |
| Vector Store | Pinecone (hybrid search), Kuromoji, WinkTokenizer |
| Serverless | AWS Lambda (SAM), S3, Cognito, DynamoDB |
| File Processing | @react-pdf/renderer, mammoth, xlsx, docx, turndown |
| UI | React 19, react-markdown |
| Hosting | AWS Amplify |

## Troubleshooting

### Lambda Function URL not set
1. Deploy with `cd lambda && sam build && sam deploy`
2. Set the output Function URL in `.env.local` as `NEXT_PUBLIC_LAMBDA_FUNCTION_URL`

### Knowledge base request size error (exceeds 2 MB)
- Reduce `batchSize` in `vector-store.ts` (e.g., 30)

### Low search accuracy
1. Enable hybrid search (`ENABLE_HYBRID_SEARCH=true`)
2. Use "Full Text" for important files
3. Use DOCX/Markdown instead of PDF

### Report generation stalls with full-text inclusion
1. Reduce full-text files to 2 or fewer
2. Use RAG (Full Text OFF) for large files

### Japanese characters garbled in PDF
- Verify Noto Sans JP font CDN loading and network connectivity

### Language does not switch
1. Clear browser localStorage
2. Reload the page and select language again

## License

[License information]