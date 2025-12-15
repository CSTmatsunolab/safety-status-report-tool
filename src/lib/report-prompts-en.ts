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
## GSN (Goal Structuring Notation) Detailed Analysis

### GSN Node Evaluation Method
For each node in the GSN, provide detailed evaluation in the following format.
Evaluate ALL nodes. If information is insufficient, explicitly state "Cannot Evaluate (Insufficient Information)" or "Not documented". NEVER speculate or fabricate information.

【Goal Node (G) Evaluation】
For each goal node, include the following 3 points:
1. Achievement Status: One of "Achieved", "Partially Achieved", "Not Achieved", or "Cannot Evaluate (Insufficient Information)"
2. Basis for Judgment: Specific evidence, data, or documents supporting this judgment. If no information available, state "No relevant information in provided documents"
3. Issues/Recommendations: What is lacking for full achievement, recommended actions. If cannot evaluate, state "Additional information required for evaluation"

Example 1 (When evaluation is possible):
"G1: The system can be operated safely"
• Achievement Status: Partially Achieved
• Basis: E1 test results cover 95% of main scenarios, E2 risk assessment shows countermeasures implemented for 3 high-risk items
• Issues: Remaining 5% untested scenarios need coverage

Example 2 (When information is insufficient):
"G5: The system can transition to a safe state when anomalies occur"
• Achievement Status: Cannot Evaluate (Insufficient Information)
• Basis: Detailed argumentation structure and evidence for G5 not included in provided documents
• Issues: Addition of detailed functional safety argumentation based on ISO 26262 required

【Strategy Node (S) Evaluation】
Evaluate each strategy. If information is insufficient, state "Details unknown":
1. Validity: Can this strategy adequately demonstrate the goal? (If unknown, state "Insufficient information to judge")
2. Completeness: Are all necessary perspectives covered without gaps?
3. Effectiveness: Is it backed by actual evidence?

【Evidence Node (E/Sn) Evaluation】
Evaluate each evidence. If details are unknown, state "Content details not documented":
1. Evidence Type: Test results, analysis report, third-party evaluation, etc. (If unknown, state "Type unknown")
2. Evidence Strength: Sufficient / Partial / Insufficient / Cannot Judge
3. Relevance to Goals: Which goals does it support and to what extent?

【Context Node (C) Evaluation】
Evaluate only if information is available. If unknown, state "Details not documented":
1. Validity of assumptions
2. Clarity of scope
3. Impact of constraints

### Overall GSN Structure Evaluation
Evaluate the entire GSN from the following perspectives:
1. Argument Completeness: Are all goals sufficiently supported by evidence?
2. Logical Consistency: Is the Goal→Strategy→Sub-goal/Evidence flow consistent and free of contradictions?
3. Unresolved Nodes: Identify nodes lacking detail or evidence
4. Information-Insufficient Nodes: List nodes that could not be evaluated due to lack of information in provided documents

### Evaluation Summary
At the end of the GSN section, include an evaluation summary in the following format:

Main Goal Achievement Status:
• G1 (Top Goal): [Status] - [One-sentence basis summary]
• G2: [Status] - [One-sentence basis summary]
• G3: [Status] - [One-sentence basis summary]
...

CRITICAL (Hallucination Prevention):
- Evaluate ALL nodes in the GSN
- If information is insufficient, ALWAYS explicitly state "Cannot Evaluate (Insufficient Information)" or "Not documented"
- Speculating or fabricating information not in provided documents is STRICTLY PROHIBITED
- Include "achievement evaluation", not just "structure explanation"
- Having nodes that cannot be evaluated is acceptable. Honestly stating "Cannot Evaluate" is important`;
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
