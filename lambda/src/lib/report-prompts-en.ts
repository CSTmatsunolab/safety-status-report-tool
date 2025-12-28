// src/lib/report-prompts-en.ts

import { Stakeholder } from '../types';
import { RhetoricStrategy } from './rhetoric-strategies';

/**
 * Generate system prompt for report generation (English)
 */
export function generateSystemPromptEN(): string {
  return `You are a professional safety report writer.
Analyze the provided GSN files and related documents in detail, and create a Safety Status Report (SSR) for the stakeholder.

Important: Always base the report on the content of the provided documents. Use specific information from the documents (project names, system names, locations, dates, technical specifications, etc.) rather than generic content.

CRITICAL: You MUST write the entire report in English, even if the input documents are written in Japanese or other languages. Translate all relevant information into English while maintaining accuracy.

Essential Nature of SSR: An SSR is not merely a listing of information, but a "safety argumentation document." The most important thing is to clearly demonstrate the logical basis for why the system can be considered safe.`;
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
 * Check if role is executive level
 */
function isExecutiveRole(role: string): boolean {
  const executiveKeywords = ['executive', 'cxo', 'ceo', 'cfo', 'cto', 'coo', 'director', 'officer', 'president', 'vp', 'vice president'];
  return executiveKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

/**
 * Check if role is regulator/auditor
 */
function isRegulatorRole(role: string): boolean {
  const regulatorKeywords = ['regulator', 'certification', 'audit', 'compliance', 'authority', 'inspector'];
  return regulatorKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

/**
 * Check if role is architect/engineer
 */
function isArchitectRole(role: string): boolean {
  const architectKeywords = ['architect', 'engineer', 'designer', 'developer', 'technical'];
  return architectKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

/**
 * Generate report guidelines (English) - Stakeholder-specific
 */
export function generateReportGuidelinesEN(stakeholder: Stakeholder): string {
  const role = stakeholder.role;
  
  if (isExecutiveRole(role)) {
    return `
Report Writing Guidelines (for Executive audience):
- Focus on the perspective and concerns of ${role}
- Present information needed for executive decisions concisely
- Minimize technical details, emphasize conclusions and impacts
- Include specific, actionable recommendations
- Use formal writing style consistently
- Target 5-10 pages total, keep it concise
- Each section should contain only information necessary for executive decisions`;
  }
  
  return `
Report Writing Guidelines:
- Focus on the perspective and concerns of ${role}
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
Only judge documents as inappropriate when:
- No information related to safety, risks, hazards, system evaluation, or technical verification is included at all

Important Criteria:
- Text-based GSN descriptions (such as "G1 is...", "S1 is...") are valid GSN files
- GSN does not need to be in diagram format; text-based structure descriptions are sufficient
- Reports can be created even without GSN files, as long as safety reports or risk assessment documents are available
- Even with partial information, create the best possible report from the provided information

Note: If any safety-related information is included, maximize its use. However, do not fabricate or speculate information not found in the provided documents (no hallucination). Clearly state "Not documented in provided materials" for unknown points.`;
}

/**
 * Generate document usage principles prompt (English)
 */
export function generateDocumentUsagePrinciplesEN(): string {
  return `
## Document Usage Principles
- Extract all relevant information from provided documents without omission
- Ensure the following elements are captured:
  * Numerical data (statistics, measurements, counts, probabilities, percentages)
  * Proper nouns (system names, place names, organization names, standard names)
  * Temporal information (dates, periods, trends, changes)
  * Correspondence between risks and countermeasures`;
}

/**
 * Generate GSN analysis prompt (English) - Stakeholder-specific
 */
export function generateGSNAnalysisPromptEN(hasGSNFile: boolean, stakeholder?: Stakeholder): string {
  if (!hasGSNFile) {
    return '';
  }

  const role = stakeholder?.role || 'Safety Engineer';
  
  // Executive (Concise version)
  if (isExecutiveRole(role)) {
    return `
## GSN Analysis (Executive Summary)

### IMPORTANT: Keep GSN analysis within 1 page

Summarize in ONE section. Do NOT create individual subsections for each node.

1. GSN Achievement Status (Table format)
   [Table: GSN Achievement Status Overview]
   Present in one table:
   - Node ID (major goals only: G1, G2, G3, etc.)
   - Goal name (brief, ~10 words)
   - Achievement status (Achieved/Partial/Not achieved/Cannot evaluate)
   - Business impact (High/Medium/Low)

2. Overall Argumentation Evaluation (3-5 sentences)
   - Top goal achievement status and basis
   - Major sub-goal status
   - Strengths and weaknesses of argumentation

3. Key Points for Executive Decision (3-5 bullet points)
   - Only items necessary for decision-making

4. Recommended Actions (2-3 bullet points)
   - Short-term/Medium-term/Long-term actions

### Prohibited
- Do NOT create individual subsections (2.1, 2.2, 2.3...) for each node (G1, G2, S1, S2...)
- Do NOT use more than 1 page for a single node
- Do NOT write lengthy technical explanations`;
  }
  
  // Regulator (Standards compliance version)
  if (isRegulatorRole(role)) {
    return `
## GSN Analysis (for Regulatory Review)

### Format
Demonstrate argumentation validity from standards compliance perspective.

1. GSN Structure and Standards Compliance
   [Table: GSN Node × Standards Requirements Correspondence]
   - Each goal node and corresponding standard clauses
   - Compliance status (Compliant/Partial/Non-compliant)
   - Evidence document references

2. Major Goal Evaluation (Table format)
   [Table: Goal Node Evaluation Summary]
   - Node ID, Goal content, Achievement status, Basis, Standard clause

3. Evidence Auditability
   [Table: Evidence List and Verification Status]
   - Evidence type, Independent verification status, Document reference

4. Argumentation Gaps and Corrective Plans
   - List of not achieved/cannot evaluate nodes and corrective plans`;
  }
  
  // Architect (Detailed version)
  if (isArchitectRole(role)) {
    return `
## GSN Detailed Analysis (for Technical Review)

### 1. GSN Structure Visualization
[Figure: GSN Hierarchical Structure Diagram]

### 2. Goal Node (G) Detailed Evaluation
For each goal node:
- Achievement status: Achieved/Partial/Not achieved/Cannot evaluate
- Judgment basis: Reference to evidence and evaluation rationale
- Technical issues: Issues and countermeasures from design perspective
- Related components: Affected system elements

### 3. Strategy Node (S) Evaluation
For each strategy:
- Decomposition validity (technical perspective)
- Completeness evaluation
- Design impact

### 4. Evidence Node (E/Sn) Technical Evaluation
For each evidence:
- Evidence type and technical details
- Test conditions/Analysis conditions
- Coverage and limitations

### 5. GSN-Architecture Correspondence Analysis
[Table: GSN Node × Component Correspondence]

### 6. Argumentation Gap Technical Analysis
- Missing evidence and additional verification proposals`;
  }
  
  // Safety Engineer (Technical detail version) - Default
  return `
## GSN Detailed Analysis

### 1. GSN Structure Visualization
[Figure: GSN Complete Hierarchical Diagram]

### 2. Goal Node (G) Evaluation
For each goal node, document:
1. Achievement status: "Achieved," "Partial," "Not achieved," or "Cannot evaluate"
2. Judgment basis: Evidence and data supporting the judgment
3. Issues/Recommendations: Gaps for full achievement

### 3. Strategy Node (S) Evaluation
For each strategy:
1. Validity: Can this strategy demonstrate the goal?
2. Completeness: Are all necessary perspectives covered?
3. Effectiveness: Is it supported by actual evidence?

### 4. Evidence Node (E/Sn) Evaluation
For each evidence:
1. Evidence type and strength
2. Relevance to corresponding goal
3. Coverage and limitations

### 5. Overall GSN Structure Evaluation
1. Argumentation completeness
2. Logical consistency
3. Unresolved nodes
4. Information-insufficient nodes

### 6. Argumentation Gap Analysis
[Table: Argumentation Gap Summary]`;
}

/**
 * Generate figure requirements prompt (English) - Stakeholder-specific
 */
export function generateFigureRequirementsPromptEN(hasGSNFile: boolean, stakeholder?: Stakeholder): string {
  const role = stakeholder?.role || 'Safety Engineer';
  const minFigures = getMinimumFigureCountEN(role, hasGSNFile);
  
  let prompt = `
## Figure and Table Requirements (for ${role})

Include figures and tables effectively. Indicate positions using [Figure/Table: Description] format.

### Core Required (2 items)
1. Safety Assessment Summary Table
   [Table: Safety Assessment Results Summary]

2. Risk Correspondence Table
   [Table: Hazard-Countermeasure Correspondence Table]`;

  // Stakeholder-specific figures
  if (isExecutiveRole(role)) {
    prompt += `

### Recommended for Executive
3. Safety Dashboard (achievement rate, traffic light status)
4. Risk Heatmap (business impact perspective)`;
  } else if (isArchitectRole(role)) {
    prompt += `

### Recommended for Technical Review
3. System Architecture Diagram
4. Component Risk Mapping
5. Technical Specification Compliance Table`;
  } else if (isRegulatorRole(role)) {
    prompt += `

### Recommended for Regulatory Review
3. Standards Compliance Matrix
4. Certification Status Table
5. Audit Trail Summary`;
  } else {
    prompt += `

### Recommended for Safety Engineer
3. Detailed Risk Assessment Matrix
4. FMEA/Hazard Analysis Table
5. Safety Function Allocation Table
6. Verification Coverage Table`;
  }

  // GSN-related figures
  if (hasGSNFile) {
    if (isExecutiveRole(role)) {
      prompt += `

### GSN-Related (Concise)
- GSN Achievement Status Table (table format, major goals only)`;
    } else {
      prompt += `

### GSN-Related
- GSN Hierarchical Structure Diagram
- GSN Node Relationship Matrix`;
    }
  }

  prompt += `

### Guidelines
- Minimum: ${minFigures} figures/tables
- Recommended: ${minFigures + 2} to ${minFigures + 4}

### Principles
- If information is insufficient, state "Cannot illustrate due to insufficient information"
- Do not create figures based on speculation
- Always assign numbers and titles`;

  return prompt;
}

/**
 * Get minimum figure count for stakeholder (English)
 */
function getMinimumFigureCountEN(role: string, hasGSN: boolean): number {
  const baseCount = 4;
  const gsnBonus = hasGSN ? 1 : 0;
  
  if (isExecutiveRole(role)) {
    return baseCount + gsnBonus;
  }
  if (isArchitectRole(role)) {
    return baseCount + gsnBonus + 2;
  }
  if (isRegulatorRole(role)) {
    return baseCount + gsnBonus + 1;
  }
  return baseCount + gsnBonus + 1;
}

/**
 * Generate information gap handling prompt (English)
 */
export function generateInformationGapHandlingPromptEN(): string {
  return `
## Handling Information Gaps

When information is insufficient:
- State "[INFORMATION GAP] Data regarding XX is not documented"
- Do not simply omit; clearly indicate what is missing
- Do not supplement with speculation or fabrication`;
}

/**
 * Generate evidence-based prompt (English)
 */
export function generateEvidenceBasedPromptEN(): string {
  return `
## Evidence-Based Writing
- All claims must be based on evidence from provided documents
- Mark information not found as "Not documented"
- Quote important numbers accurately from source`;
}

/**
 * Generate risk analysis prompt (English)
 */
export function generateRiskAnalysisPromptEN(): string {
  return `
## Risk Analysis
- Organize identified risks from these perspectives:
  * Risk content and occurrence mechanism
  * Probability and impact (if documented)
  * Implemented/planned countermeasures
  * Residual risks and acceptability`;
}

/**
 * Generate chart instruction prompt (English)
 */
export function generateChartInstructionPromptEN(): string {
  return `
## Handling Figures and Tables
- Indicate insertion positions using [Figure/Table: Description] format
- Mention key values from figures/tables in the text`;
}

/**
 * Generate quantitative prompt (English)
 */
export function generateQuantitativePromptEN(): string {
  return `
## Prioritize Quantitative Information
- Use specific numbers rather than "many" or "few"
- Clearly describe trends in time-series data`;
}

/**
 * Generate completeness prompt (English)
 */
export function generateCompletenessPromptEN(): string {
  return `
## Completeness and Accuracy
- Comprehensively utilize important information from documents
- Always include:
  * Safety assessment results and rationale
  * Unresolved issues and limitations
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
- Make statistical evidence clear`,
    
    [RhetoricStrategy.EMOTIONAL_APPEAL]: `
- Appeal to stakeholder values
- Use success stories
- Use empathetic expressions`,
    
    [RhetoricStrategy.LOGICAL_REASONING]: `
- Emphasize logical flow
- Clearly show cause-and-effect relationships
- Use step-by-step explanations`,

    [RhetoricStrategy.AUTHORITY_BASED]: `
- Cite industry standards and regulations
- Reference expert opinions
- Introduce best practices`,
    
    [RhetoricStrategy.PROBLEM_SOLUTION]: `
- Clearly define problems
- Analyze root causes
- Present feasible solutions`,
    
    [RhetoricStrategy.NARRATIVE]: `
- Develop in story format
- Explain history chronologically
- Connect to future vision`
  };
  
  return guidelines[strategy];
}

/**
 * Generate report structure prompt (English) - Stakeholder-specific
 */
export function generateStructurePromptEN(
  reportSections: string[],
  hasGSN: boolean,
  stakeholder?: Stakeholder,
  structureDescription?: string
): string {
  const role = stakeholder?.role || 'Safety Engineer';
  const sectionsFormatted = reportSections.map((section, index) => 
    `\n${index + 1}. ${section}`
  ).join('');

  let prompt = `
Create the SSR with the following structure:
Structure:${sectionsFormatted}`;

  if (hasGSN) {
    if (isExecutiveRole(role)) {
      prompt += '\nNote: Keep GSN analysis within 1 page. Do NOT create individual subsections for each node.';
    } else {
      prompt += '\nNote: Since GSN files are included, include a GSN analysis section.';
    }
  }

  if (structureDescription) {
    prompt += `\nStructure Description: ${structureDescription.slice(0, 500)}`;
  }

  if (isExecutiveRole(role)) {
    prompt += `\n
Executive Report Guidelines:
- Target 5-10 pages total
- Executive Summary: 1-2 pages
- GSN Analysis: within 1 page
- Prioritize information needed for executive decisions over technical details
- Keep each section concise`;
  }

  prompt += `\n
Notes:
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
    generateGSNAnalysisPromptEN(hasGSN, stakeholder),
    generateFigureRequirementsPromptEN(hasGSN, stakeholder),
    generateInformationGapHandlingPromptEN(),
    generateEvidenceBasedPromptEN(),
    generateRiskAnalysisPromptEN(),
    generateChartInstructionPromptEN(),
    generateQuantitativePromptEN(),
    generateCompletenessPromptEN(),
    `\nApply the characteristics of ${strategy}:${getStrategyGuidelinesEN(strategy)}`,
    `\nProvided document content:\n${contextContent}`,
    generateStructurePromptEN(reportSections, hasGSN, stakeholder, structureDescription)
  ];

  return parts.join('\n');
}