# Lambda SSR Generator

AWS Lambda Function for generating Safety Status Reports with streaming response.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Lambda Function URL (Streaming)                                 │
│                                                                 │
│  1. Receive request                                             │
│  2. Prepare context (RAG + S3)                                  │
│  3. Generate sections (Claude API)                              │
│  4. Stream events back to client                                │
│                                                                 │
│  Max execution time: 15 minutes                                 │
│  Response mode: RESPONSE_STREAM                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Stream Events

The function sends Server-Sent Events (SSE) format:

```typescript
// Progress event
{
  type: 'progress',
  data: {
    phase: 'context' | 'generation',
    message: string,
    current?: number,
    total?: number,
    sectionName?: string
  }
}

// Section complete event
{
  type: 'section',
  data: {
    sectionName: string,
    sectionIndex: number,
    content: string
  }
}

// Complete event
{
  type: 'complete',
  data: {
    title: string,
    content: string,
    stakeholder: Stakeholder,
    rhetoricStrategy: string,
    totalDuration: number
  }
}

// Error event
{
  type: 'error',
  data: {
    message: string,
    details?: string
  }
}
```

## Deployment

### Prerequisites

- AWS CLI configured
- AWS SAM CLI installed
- Node.js 20.x

### Build and Deploy

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy with SAM
sam build
sam deploy --guided
```

### SAM Parameters

| Parameter | Description |
|-----------|-------------|
| AnthropicApiKey | Anthropic API key for Claude |
| OpenAIApiKey | OpenAI API key for embeddings |
| PineconeApiKey | Pinecone API key |
| PineconeIndexName | Pinecone index name (default: ssr-index) |
| S3BucketName | S3 bucket for file storage |
| AllowedOrigin | CORS allowed origin |

## Local Development

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your API keys

# Build
npm run build

# Test locally with SAM
sam local invoke SSRGeneratorFunction -e events/test-event.json
```

## Project Structure

```
lambda-ssr-generator/
├── src/
│   ├── index.ts              # Main handler (streaming)
│   ├── types.ts              # Type definitions
│   └── lib/
│       ├── anthropic.ts      # Claude API client
│       ├── pinecone.ts       # Pinecone client
│       ├── s3.ts             # S3 client
│       ├── query-enhancer.ts # Query enhancement
│       ├── sparse-vector.ts  # Sparse vector generation
│       ├── prompts.ts        # Prompt templates
│       └── rhetoric-strategies.ts # Rhetoric strategies
├── package.json
├── tsconfig.json
├── template.yaml             # SAM template
├── .env.example
└── README.md
```

## Integration with Next.js Frontend

See `src/hooks/useLambdaGeneration.ts` in the main project for the frontend integration hook.

```typescript
// Example usage
const { generateReport, progress, isGenerating } = useLambdaGeneration();

await generateReport({
  stakeholder,
  reportStructure,
  files,
  fullTextFileIds,
  language: 'ja'
});
```
