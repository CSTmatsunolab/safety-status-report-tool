// src/lib/report-prompts-en.ts

import { Stakeholder } from '@/types';
import { RhetoricStrategy } from './report-structures';

/**
 * Generate system prompt for report generation (English)
 */
export function generateSystemPromptEN(): string {
  return `You are a professional safety report writer.
Analyze the provided GSN files and related documents in detail, and create a Safety Status Report (SSR) for the stakeholder.

Important: Always base the report on the content of the provided documents. Use specific information from the documents (project names, system names, locations, dates, technical specifications, etc.) rather than generic content.

CRITICAL: You MUST write the entire report in English, even if the input documents are written in Japanese or other languages. Translate all relevant information into English while maintaining accuracy.`;
}

/**
 * Generate stakeholder-specific prompt section (English)
 */
export function generateStakeholderSectionEN(stakeholder: Stakeholder, strategy: string): string {
  return `
Stakeholder Information:
- Role: ${stakeholder.role}
- Key Concerns: ${stakeholder.concerns.join(', ')}
- Rhetoric Strategy: ${strategy}`;
}

/**
 * Generate report guidelines (English)
 */
export function generateReportGuidelinesEN(stakeholder: Stakeholder): string {
  return `
Report Writing Guidelines:
- Focus on the perspective and concerns of ${stakeholder.role}
- Use technical terminology as needed, but explain clearly
- Provide objective analysis based on data and facts
- Include specific, actionable recommendations
- Use formal writing style consistently`;
}

/**
 * Generate output format restrictions (English)
 */
export function generateFormatRestrictionsEN(): string {
  return `
## Output Format Restrictions (Must Follow)
- Do not use Markdown notation at all
  - Prohibited: ##, ###, **, *, - (bullet points), >, \`\`\`, \`, [](), etc.
- Use numbered format for headings: "1. Section Name", "1.1 Subsection Name", "1.1.1 Item Name"
- When bullet points are needed, use numbered lists (1. 2. 3.) or "•"
- Use quotation marks or context to emphasize important terms
- Describe tables without using grid lines, with line breaks for each item`;
}

/**
 * Generate guidelines for inappropriate files (English)
 */
export function generateInvalidFileGuidelinesEN(): string {
  return `
## Response for Inappropriate Documents
Only judge documents as inappropriate when the following condition is met:
- No information related to safety, risks, hazards, system evaluation, or technical evaluation/verification is included at all

Important Judgment Criteria:
- Text-based GSN descriptions (such as "G1 is...", "S1 is...") are valid GSN files
- GSN does not need to be in diagram format; text-based structure descriptions are sufficient
- Reports can be created even without GSN files, as long as safety reports or risk assessment documents are available
- Safety reports, risk assessment documents, and demonstration experiment reports are valid documents
- Even with partial information, create the best possible report from the provided information

Only if documents are completely inappropriate, respond in the following format:
1. Clearly state: "A Safety Status Report cannot be created from the provided documents."
2. Briefly explain the reason (e.g., no safety-related information included)
3. Describe the types of documents required for SSR creation:
   - GSN (Goal Structuring Notation) files (text format acceptable)
   - Safety assessment reports
   - Risk assessment documents
   - Technical specifications (with safety requirements)
   - Test result reports
   - Incident/accident reports
   - Hazard analysis materials
4. Request: "Please upload documents related to safety as described above."

Note: If any safety-related information is included, maximize the use of that information to create a report. However, do not fabricate or speculate information not found in the provided documents (no hallucination). Clearly state "Not documented in provided materials" for unknown points.`;
}

/**
 * Generate document usage principles prompt (English)
 */
export function generateDocumentUsagePrinciplesEN(): string {
  return `
## Document Usage Principles
- Extract all relevant information from provided documents without omission, and prioritize their use
- Ensure the following elements are captured:
  * Numerical data (statistics, measurements, occurrence counts, probabilities, percentages, etc.)
  * Proper nouns (system names, place names, organization names, standard names, etc.)
  * Temporal information (dates, periods, trends, changes, etc.)
  * Correspondence between risks and countermeasures`;
}

/**
 * Generate GSN analysis prompt (English)
 */
export function generateGSNAnalysisPromptEN(hasGSNFile: boolean): string {
  if (!hasGSNFile) {
    return '';
  }

  return `
## Structured Content Analysis
- If GSN files are provided:
  - Evaluate whether each Goal (G) node has been achieved
  - Verify the validity and effectiveness of Strategy (S) nodes
  - Confirm that Solutions (Sn) and Contexts (C) provide appropriate evidence
  - If there are unachieved or insufficient nodes, clearly state the gaps and countermeasures
  - Evaluate the logical consistency of the entire GSN structure
- If other structured documents (flowcharts, hierarchical structures, etc.) are provided:
  - Understand the structure and reflect relationships between elements in the report
  - Evaluate the completeness and validity of the structure`;
}

/**
 * Generate evidence-based prompt (English)
 */
export function generateEvidenceBasedPromptEN(): string {
  return `
## Evidence-Based Writing
- All claims must be based on evidence from provided documents
- Information not found in documents should be clearly marked as "Not documented"; do not create assumptions or estimates
- Important numerical data and statistics must be accurately quoted from original text`;
}

/**
 * Generate risk analysis prompt (English)
 */
export function generateRiskAnalysisPromptEN(): string {
  return `
## Thorough Risk Analysis
- Extract all identified risks without omission and organize from the following perspectives:
  * Specific content and mechanism of occurrence
  * Probability of occurrence and degree of impact (if documented)
  * Implemented/planned countermeasures
  * Residual risks and their acceptability`;
}

/**
 * Generate chart instruction prompt (English)
 */
export function generateChartInstructionPromptEN(): string {
  return `
## Handling of Figures and Tables
- Actively insert figures and tables, indicating insertion positions in the following format:
  [Figure/Table: Description]
  Example: [Figure/Table: Bar chart showing countermeasure status by risk level]
- When there is data that should be shown in a figure/table, also mention the main values in the text
- Explain trends in graphs (rising/falling/stable, etc.) in text`;
}

/**
 * Generate quantitative prompt (English)
 */
export function generateQuantitativePromptEN(): string {
  return `
## Prioritize Quantitative Information
- Use specific numbers rather than qualitative expressions like "many" or "few"
- If statistical analysis results (confidence intervals, standard deviations, etc.) are available, explain their meaning
- For time-series data, clearly describe trends and turning points`;
}

/**
 * Generate completeness prompt (English)
 */
export function generateCompletenessPromptEN(): string {
  return `
## Ensuring Completeness and Accuracy
- Comprehensively utilize important information from provided documents
- Always include the following:
  * Safety assessment results and rationale
  * Unresolved issues and limitations
  * Assumptions and scope of application
  * Improvement proposals and future directions`;
}

/**
 * Generate rhetoric strategy guidelines (English)
 */
export function getStrategyGuidelinesEN(strategy: RhetoricStrategy): string {
  const guidelines: { [key in RhetoricStrategy]: string } = {
    [RhetoricStrategy.DATA_DRIVEN]: `
- Use extensive numerical data
- Present visually with graphs and tables
- Make statistical evidence clear
- Argue based on objective facts`,
    
    [RhetoricStrategy.EMOTIONAL_APPEAL]: `
- Appeal to stakeholder values
- Use success stories
- Paint visions and ideals
- Use empathetic expressions`,
    
    [RhetoricStrategy.LOGICAL_REASONING]: `
- Emphasize logical flow
- Clearly show cause-and-effect relationships
- Use step-by-step explanations
- Maintain technical accuracy
- Support with specific data and numbers
- Present measurable indicators`,

    [RhetoricStrategy.AUTHORITY_BASED]: `
- Cite industry standards and regulations
- Reference expert opinions
- Introduce best practices
- Use highly credible sources`,
    
    [RhetoricStrategy.PROBLEM_SOLUTION]: `
- Clearly define problems
- Analyze root causes
- Present feasible solutions
- Explain implementation steps specifically`,
    
    [RhetoricStrategy.NARRATIVE]: `
- Develop in story format
- Explain history chronologically
- Clarify characters and roles
- Connect to future vision`
  };
  
  return guidelines[strategy];
}

/**
 * Generate report structure prompt (English)
 */
export function generateStructurePromptEN(
  reportSections: string[],
  hasGSN: boolean,
  structureDescription?: string
): string {
  const sectionsFormatted = reportSections.map((section, index) => 
    `\n${index + 1}. ${section}`
  ).join('');

  let prompt = `
Create the SSR with the following structure:
Structure:${sectionsFormatted}`;

  if (hasGSN) {
    prompt += '\nNote: Since GSN files are included, include a GSN analysis section.';
  }

  if (structureDescription) {
    prompt += `\nStructure Description: ${structureDescription.slice(0, 500)}`;
  }

  prompt += `\n
Notes:
- The report must accurately reflect the content of provided documents and be based on specific facts and data
- Use formal writing style consistently
- Do not use Markdown notation (##, **, *, -, etc. are prohibited)`;

  return prompt;
}

/**
 * Build complete user prompt (English)
 */
export function buildCompleteUserPromptEN(params: {
  stakeholder: Stakeholder;
  strategy: RhetoricStrategy;
  contextContent: string;
  reportSections: string[];
  hasGSN: boolean;
  structureDescription?: string;
}): string {
  const { stakeholder, strategy, contextContent, reportSections, hasGSN, structureDescription } = params;

  const parts = [
    generateSystemPromptEN(),
    generateFormatRestrictionsEN(),
    generateInvalidFileGuidelinesEN(),
    generateStakeholderSectionEN(stakeholder, strategy),
    generateReportGuidelinesEN(stakeholder),
    generateDocumentUsagePrinciplesEN(),
    generateGSNAnalysisPromptEN(hasGSN),
    generateEvidenceBasedPromptEN(),
    generateRiskAnalysisPromptEN(),
    generateChartInstructionPromptEN(),
    generateQuantitativePromptEN(),
    generateCompletenessPromptEN(),
    `\nApply the characteristics of ${strategy}:${getStrategyGuidelinesEN(strategy)}`,
    `\nProvided document content:\n${contextContent}`,
    generateStructurePromptEN(reportSections, hasGSN, structureDescription)
  ];

  return parts.join('\n');
}