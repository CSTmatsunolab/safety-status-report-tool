# Lambda SSR Reporter

An AWS Lambda Function that generates Safety Status Reports with streaming response support.

## Quick Start

### First Deployment

```bash
cd lambda

# Install dependencies
npm install

# Build & deploy (use --guided for interactive setup on first run)
sam build
sam deploy --guided
```

### Subsequent Deployments

```bash
cd lambda

# Always run sam build before deploy when code changes
sam build
sam deploy
```

> **Important**: `sam deploy` alone is not enough. If you have changed TypeScript source files, you must run `sam build` first.

## Post-Deployment Configuration

After deployment, copy the output **Lambda Function URL** and set it in the Next.js application's environment variables:

```bash
# .env.local or Amplify environment variables
NEXT_PUBLIC_LAMBDA_FUNCTION_URL=https://xxxxxxxx.lambda-url.ap-northeast-1.on.aws/
```

## Environment Variables (SAM Parameters)

| Parameter | Description | Required |
|-----------|-------------|----------|
| AnthropicApiKey | Anthropic API key (for Claude) | ✅ |
| OpenAIApiKey | OpenAI API key (for embeddings) | ✅ |
| PineconeApiKey | Pinecone API key | ✅ |
| PineconeIndexName | Pinecone index name | Default: `safety-status-report-tool` |
| S3BucketName | S3 bucket name | ✅ |

## Project Structure

```
lambda/
├── src/
│   ├── index.ts                 # Main handler (streaming)
│   ├── types.ts                 # Type definitions
│   ├── wink-tokenizer.d.ts      # WinkTokenizer type definitions
│   └── lib/
│       ├── rag/
│       │   ├── index.ts             # RAG module exports
│       │   ├── types.ts             # RAG type definitions
│       │   ├── query-enhancer/
│       │   │   ├── index.ts                          # Exports + debugQueryEnhancement
│       │   │   ├── QueryEnhancer.ts                  # Base class
│       │   │   ├── CustomStakeholderQueryEnhancer.ts  # Extended class
│       │   │   ├── dictionaries/
│       │   │   │   ├── role-translations.ts     # Role translations, synonyms, templates
│       │   │   │   ├── concern-synonyms.ts      # Concern concretization, synonyms, translations
│       │   │   │   └── field-terms.ts           # Domain-specific keywords
│       │   │   └── utils/
│       │   │       ├── language-detection.ts    # detectLanguage + helpers
│       │   │       └── concern-prioritizer.ts   # prioritizeConcerns + scoring
│       │   ├── rag-utils.ts         # RAG utilities
│       │   ├── rrf-fusion.ts        # RRF search & dynamic K-value computation
│       │   └── sparse-vector-utils.ts # Sparse vector generation (Kuromoji/Wink)
│       ├── report-prompts.ts        # Japanese prompts
│       ├── report-prompts-en.ts     # English prompts
│       └── rhetoric-strategies.ts   # Rhetorical strategies
│
├── package.json
├── tsconfig.json
├── template.yaml                # SAM template
├── samconfig.toml               # SAM config (generated after first deploy)
└── README.md
```

## Processing Flow

```
Request received
    ↓
1. RRF search (5 auto-generated queries + dynamic K-value)
    ↓
2. Context preparation
   - Fetch files from S3 (if over 18 MB)
   - XLSX → per-sheet text
   - DOCX → text extraction
   - PDF → text with page counts
    ↓
3. Prompt construction
    ↓
4. Claude API (streaming)
    ↓
5. Real-time delivery via SSE
```

## Stream Event Format

Responses are sent as Server-Sent Events (SSE):

```typescript
// Progress event
{
  type: 'progress',
  status: 'searching' | 'preparing' | 'building' | 'generating' | 'finalizing',
  message: string,
  percent: number
}

// Text streaming event
{
  type: 'text',
  content: string  // Fragment of generated text
}

// Completion event
{
  type: 'complete',
  report: {
    title: string,
    content: string,
    stakeholder: Stakeholder,
    rhetoricStrategy: string
  }
}

// Error event
{
  type: 'error',
  message: string,
  details?: string
}
```

## Frontend Integration

Use `src/hooks/useSectionGeneration.ts` to call the Lambda Function:

```typescript
const {
  generateReport,
  isGenerating,
  progress,
  streamingContent
} = useSectionGeneration();

await generateReport({
  files,
  stakeholder,
  reportStructure,
  userIdentifier,
  language: 'ja'
});
```

## Troubleshooting

### Build Errors

```bash
# Remove node_modules and reinstall
rm -rf node_modules
npm install
sam build
```

### Deployment Errors

```bash
# Clear cache
rm -rf .aws-sam
sam build
sam deploy
```

### Adding Dependencies

When adding a new npm package:

```bash
npm install <package-name>
sam build   # Required!
sam deploy
```

## Local Testing

```bash
# Run locally with SAM (requires Docker)
sam local invoke SSRGeneratorFunction -e events/test-event.json
```

## Key Dependencies

| Package | Purpose |
|---------|---------|
| @anthropic-ai/sdk | Claude API |
| @pinecone-database/pinecone | Vector search |
| @aws-sdk/client-s3 | S3 file retrieval |
| openai | Embedding generation |
| kuromoji | Japanese tokenizer |
| wink-tokenizer | English tokenizer |
| xlsx | Excel file processing |
| mammoth | Word file processing |
| pdf-parse | PDF file processing |