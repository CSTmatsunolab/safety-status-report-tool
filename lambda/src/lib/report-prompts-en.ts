// src/lib/report-prompts-en.ts
// Final version v2: Duplicates removed + Anti-hallucination reinforced + Causal analysis fabrication prohibited

import { Stakeholder } from '../types';
import { RhetoricStrategy } from './rhetoric-strategies';

// ============================================================================
// Utility Functions (Stakeholder Detection)
// ============================================================================

function isExecutiveRole(role: string): boolean {
  const executiveKeywords = ['executive', 'cxo', 'ceo', 'cfo', 'cto', 'coo', 'director', 'officer', 'president', 'vp', 'vice president'];
  return executiveKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

function isRegulatorRole(role: string): boolean {
  const regulatorKeywords = ['regulator', 'certification', 'audit', 'compliance', 'authority', 'inspector'];
  return regulatorKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

function isArchitectRole(role: string): boolean {
  const architectKeywords = ['architect', 'engineer', 'designer', 'developer', 'technical'];
  return architectKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

function isBusinessRole(role: string): boolean {
  const businessKeywords = ['business', 'sales', 'marketing', 'planning', 'commercial'];
  return businessKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

// ============================================================================
// 1. System Prompt (Role Definition Only)
// ============================================================================

export function generateSystemPromptEN(): string {
  return `You are a professional safety report writer.
Analyze the provided GSN files and related documents in detail, and create a Safety Status Report (SSR) for the stakeholder.

Essential Nature of SSR: An SSR is not merely a listing of information, but a "safety argumentation document." The most important thing is to clearly demonstrate the logical basis for why the system can be considered safe.

Language: Write the entire report in English, regardless of the input document language.`;
}

// ============================================================================
// 2. Anti-Hallucination (Critical - Reinforced v2)
// ============================================================================

export function generateAntiHallucinationPromptEN(stakeholder?: Stakeholder): string {
  const role = stakeholder?.role || '';
  
  let basePrompt = `
## ANTI-HALLUCINATION RULES (MANDATORY COMPLIANCE)

### Fundamental Principle
Information not explicitly stated in the provided documents MUST NEVER be generated, estimated, or fabricated.
Creating "plausible-sounding stories" is a distortion of facts and is STRICTLY PROHIBITED.

### PROHIBITED Information Categories

1. Costs / Budget / Investment Amounts
   PROHIBITED: "approximately $200K", "investment of $450K", "cost of $100K", "losses in millions"
   REQUIRED: "[ESTIMATE NEEDED] Cost not documented in provided materials"

2. Specific Durations / Delay Predictions
   PROHIBITED: "2-4 weeks delay", "expected completion in 3 months"
   REQUIRED: Use only documented dates, or "[TO BE CONFIRMED] Duration not documented"

3. Headcount / Resource Numbers
   PROHIBITED: "5 engineers required" (when not documented)
   REQUIRED: Use only documented information, or "[TO BE CALCULATED]"

4. ROI / Return on Investment
   PROHIBITED: "ROI: High", "opportunity cost of $X million"
   REQUIRED: "[OUT OF SCOPE] ROI evaluation is outside the scope of this report"

5. Self-calculated Values / Percentages
   PROHIBITED: Unfounded values like "achievement rate 73.3%"
   REQUIRED: Quote documented values directly; show calculation formula if deriving

6. Market Predictions / Business Impact
   PROHIBITED: "market share will decrease by X%", "competitive advantage will be lost"
   REQUIRED: Document only stated facts

7. Figure/Table Data
   PROHIBITED: Creating figures with undocumented values
   REQUIRED: State "Cannot illustrate due to insufficient information"

8. Causal Analysis / Root Cause Stories [CRITICAL]
   PROHIBITED: Fabricating answers to "why" questions not documented
   PROHIBITED: Creating 5 Whys analysis or root cause analysis without documented records
   PROHIBITED: Connecting fragmented information with fabricated causal relationships
   PROHIBITED: Using causal expressions like "because of", "due to", "caused by" without documented evidence
   
   Specific prohibited examples:
   • "Tool selection decision was delayed because..." (not documented)
   • "Evaluation criteria were not established in advance because..." (not documented)
   • "Resource was allocated to other tasks because..." (not documented)
   • "Past project data was not utilized because..." (not documented)
   
   REQUIRED:
   • State only the status: "H-104 countermeasure is currently planned" (documented fact)
   • Indicate unknown cause: "[CAUSE UNKNOWN] Specific cause of delay is not documented"
   • When analysis is needed: "[INVESTIGATION REQUIRED] Root cause identification requires additional investigation"

9. Structural Problems / Organizational Issues Based on Speculation
   PROHIBITED: "Decision-making process delay", "Budget allocation rigidity", "Immature estimation methods"
   (Do not fabricate organizational/structural problems not explicitly stated in documents)
   REQUIRED: Describe only issues documented in provided materials

### Permitted Statements
Direct quotation of documented values (with source citation)
Calculations derivable from documented values (show calculation process)
Quotation of causal relationships explicitly stated in documents
General industry knowledge with "[REFERENCE]" tag
Explicit statements of "Not documented", "To be confirmed", "Cause unknown"

### Standard Phrases for Information Gaps
- Cost: "[ESTIMATE NEEDED] Cost is not documented; separate estimation required"
- Duration: "[TO BE CONFIRMED] Specific duration not documented"
- Evaluation: "[OUT OF SCOPE] XX is outside the scope of this report"
- Details: "[DETAILS UNKNOWN] Details of XX are not documented"
- Cause: "[CAUSE UNKNOWN] Cause of XX is not documented"
- Investigation: "[INVESTIGATION REQUIRED] Identification of XX requires additional investigation"

### Pre-Output Checklist
□ Costs/expenses → Is there documented evidence?
□ Duration/delay predictions → Is there documented evidence?
□ ROI/investment returns → Is there documented evidence?
□ Calculated values → Are formula and source data documented?
□ Headcount/resources → Is it explicitly documented?
□ Figure/table values → All from documented sources?
□ "because of", "due to" → Is this causal relationship explicitly documented?
□ 5 Whys / Root cause analysis → Is there documented analysis record?
□ Structural/organizational problems → Are they explicitly documented?`;

  // Additional warning for Business/Executive roles
  if (isBusinessRole(role) || isExecutiveRole(role)) {
    basePrompt += `

### SPECIAL WARNING FOR ${role}
The following information affecting business/executive decisions must be handled with extra rigor:
- NEVER generate specific cost/expense figures
- Do NOT evaluate ROI/investment returns (state "separate calculation required")
- Do NOT predict specific delay durations for market launch
- Do NOT estimate opportunity costs or risk amounts
- Do NOT fabricate causal analysis or root causes without documented evidence
- When needed, list items only with "[TO BE CALCULATED]", "[ESTIMATE NEEDED]", or "[INVESTIGATION REQUIRED]"`;
  }

  return basePrompt;
}

// ============================================================================
// 3. Output Constraints (Format, Style, Volume - Consolidated)
// ============================================================================

export function generateOutputConstraintsEN(stakeholder?: Stakeholder): string {
  const role = stakeholder?.role || 'Safety Engineer';
  
  // Common format rules
  const formatRules = `
## OUTPUT CONSTRAINTS (MANDATORY)

### Format
- Do NOT use Markdown notation at all
  - Prohibited: ##, ###, **, *, - (bullets), >, \`\`\`, \`, []()
- Use numbered format for headings: "1. Section Name", "1.1 Subsection Name"
- For bullet points, use numbered lists (1. 2. 3.) or "•"
- Emphasize with quotation marks or context, not formatting
- Tables without grid lines, use line breaks for each item

### Style
- Use formal writing style consistently throughout`;

  // Volume constraints by stakeholder
  if (isExecutiveRole(role)) {
    return formatRules + `

### Volume (Executive Audience)
- Total pages: 8-12 pages maximum (strictly enforced)
- Total word count: 4,000-6,000 words
- Section guidelines:
  • Executive Summary: 1-2 pages
  • GSN Analysis (if included): within 1 page
  • Technical Overview: 1 page
  • Risks and Countermeasures: 2-3 pages
  • Recommendations: 1-2 pages
- Avoid redundant explanations and repetition
- MUST complete report through final section`;
  }
  
  return formatRules + `

### Volume
- Total pages: 12-15 pages maximum (strictly enforced)
- Total word count: 6,000-8,000 words
- Section guidelines:
  • Executive Summary: 1-2 pages
  • Technical Overview: 1-2 pages
  • GSN Analysis (if included): 2-3 pages
  • Risks and Countermeasures: 2-3 pages
  • Test Results: 2-3 pages
  • Improvement Proposals: 1-2 pages
- Avoid redundant explanations and repetition
- MUST complete report through final section`;
}

// ============================================================================
// 4. Document Usage Principles
// ============================================================================

export function generateDocumentUsagePrinciplesEN(): string {
  return `
## DOCUMENT USAGE PRINCIPLES

### Required Extraction Items
Extract and reflect the following elements without omission:
- Numerical data (statistics, measurements, counts, probabilities, percentages)
- Proper nouns (system names, project names, organization names, standard names)
- Temporal information (dates, deadlines, milestones)
- Risk-countermeasure relationships
- Responsible persons/owners
- Causal relationships and root cause analysis results explicitly documented

### Citation Rules
- Cite source for all values/facts: "XX (from Document ID: XXX-001)"
- Cite each source when using multiple documents
- Quote important values accurately from source
- When describing causal relationships, cite the source document

### Priority Order
1. Explicit statements in provided documents
2. Information derivable from documents (show calculation process)
3. Explicit statement of "Not documented", "Cause unknown", or "Investigation required"`;
}

// ============================================================================
// 5. Stakeholder Information
// ============================================================================

export function generateStakeholderSectionEN(stakeholder: Stakeholder, strategy: string): string {
  return `
## STAKEHOLDER INFORMATION
- Role: ${stakeholder.role}
- Key Concerns: ${stakeholder.concerns.join(', ')}
- Rhetoric Strategy: ${strategy}`;
}

// ============================================================================
// 6. Report Guidelines (Stakeholder-specific)
// ============================================================================

export function generateReportGuidelinesEN(stakeholder: Stakeholder): string {
  const role = stakeholder.role;
  
  if (isExecutiveRole(role)) {
    return `
## REPORT GUIDELINES (Executive Audience)
- Present information needed for executive decisions concisely
- Minimize technical details, emphasize conclusions and impacts
- Include specific, actionable recommendations
- Include causal analysis only when documented in source materials`;
  }
  
  if (isBusinessRole(role)) {
    return `
## REPORT GUIDELINES (Business Division)
- Clearly present business impact and response measures
- State "calculation required" for investment/ROI unless documented
- Use only documented dates for schedule impacts
- State "investigation required" for causal analysis/root cause unless documented`;
  }
  
  return `
## REPORT GUIDELINES
- Focus on the perspective and concerns of ${role}
- Use technical terminology as needed, but explain clearly
- Provide objective analysis based on data and facts
- Include specific, actionable recommendations
- Describe causal relationships only when documented in source materials`;
}

// ============================================================================
// 7. GSN Analysis Prompt (Stakeholder-specific)
// ============================================================================

export function generateGSNAnalysisPromptEN(hasGSNFile: boolean, stakeholder?: Stakeholder): string {
  if (!hasGSNFile) {
    return '';
  }

  const role = stakeholder?.role || 'Safety Engineer';
  
  // Executive (Concise version)
  if (isExecutiveRole(role)) {
    return `
## GSN ANALYSIS (Executive Summary - Within 1 Page)

Summarize in ONE section. Do NOT create individual subsections for each node.

1. GSN Achievement Status (Table format)
   • Major goals only (G1, G2, etc.)
   • Achievement status (Achieved/Partial/Not achieved)
   • Business impact (High/Medium/Low)

2. Overall Argumentation Evaluation (3-5 sentences)

3. Key Points for Executive Decision (3-5 items)

4. Recommended Actions (2-3 items)

PROHIBITED: Individual subsections for each node, more than 1 page per node
PROHIBITED: Fabricating causes of non-achievement without documented evidence`;
  }
  
  // Regulator
  if (isRegulatorRole(role)) {
    return `
## GSN ANALYSIS (Regulatory Review)

1. GSN Structure and Standards Compliance
   [Table: GSN Node × Standards Requirements]

2. Major Goal Evaluation
   [Table: Goal Node Evaluation Summary]

3. Evidence Auditability
   [Table: Evidence List and Verification Status]

4. Argumentation Gaps and Corrective Plans
   Note: Gap causes should only be described when documented`;
  }
  
  // Architect (Detailed version)
  if (isArchitectRole(role)) {
    return `
## GSN DETAILED ANALYSIS (Designer/Architect)

1. GSN Structure Visualization
   [Figure: GSN Hierarchical Diagram]

2. Goal Node (G) Detailed Evaluation
   • Achievement status and basis (document reference required)
   • Technical issues (only those documented)
   • Related components

3. Strategy Node (S) Evaluation
   • Decomposition validity, coverage evaluation

4. Evidence Node (Sn) Technical Evaluation
   • Evidence type and strength, coverage and limitations

5. GSN-Architecture Correspondence Analysis
   [Table: GSN Node × Component Mapping]

6. Argumentation Gap Technical Analysis
   Note: Gap causes only when documented, otherwise state "[INVESTIGATION REQUIRED]"`;
  }
  
  // Default (Safety Engineer)
  return `
## GSN DETAILED ANALYSIS

1. GSN Structure Visualization
   [Figure: Complete GSN Hierarchy]

2. Goal Node (G) Evaluation
   Each goal: Achievement status, basis (evidence reference required), issues/recommendations

3. Strategy Node (S) Evaluation
   Validity, coverage, effectiveness

4. Evidence Node (Sn) Evaluation
   Evidence type and strength, coverage and limitations

5. Overall GSN Structure Evaluation
   Argumentation completeness, logical consistency, unresolved/information-lacking nodes

6. Argumentation Gap Analysis
   [Table: Argumentation Gap Summary]
   Note: Gap causes only when documented, otherwise state "[CAUSE UNKNOWN]"`;
}

// ============================================================================
// 8. Figure Requirements (Stakeholder-specific)
// ============================================================================

export function generateFigureRequirementsPromptEN(hasGSNFile: boolean, stakeholder?: Stakeholder): string {
  const role = stakeholder?.role || 'Safety Engineer';
  const minFigures = getMinimumFigureCountEN(role, hasGSNFile);
  
  let prompt = `
## FIGURE/TABLE REQUIREMENTS

### Required Figures (2)
1. [Table: Safety Evaluation Results Summary]
2. [Table: Hazard-Countermeasure Mapping]`;

  if (isExecutiveRole(role)) {
    prompt += `

### Recommended for Executives
3. Safety Dashboard (achievement rates, status indicators)
4. Risk Heatmap`;
  } else if (isArchitectRole(role)) {
    prompt += `

### Recommended for Designers
3. System Architecture Diagram
4. Component Risk Mapping
5. Technical Specification Compliance Table`;
  } else {
    prompt += `

### Recommended Figures
3. Detailed Risk Assessment Matrix
4. Verification Coverage Table`;
  }

  if (hasGSNFile) {
    prompt += isExecutiveRole(role) 
      ? `\n\n### GSN-Related: GSN Achievement Status Table (single table only)`
      : `\n\n### GSN-Related: GSN Hierarchical Diagram, GSN Node Relationship Matrix`;
  }

  prompt += `

### Figure Count: Minimum ${minFigures}, Recommended ${minFigures + 2}-${minFigures + 4}

### Insertion Method
- Indicate insertion position using [Figure/Table: Description] format
- Mention key values from figures in the text
- If information is insufficient, state "Cannot illustrate due to insufficient information"
- All data in figures/tables MUST be from documented sources (fabrication prohibited)`;

  return prompt;
}

function getMinimumFigureCountEN(role: string, hasGSN: boolean): number {
  const baseCount = 4;
  const gsnBonus = hasGSN ? 1 : 0;
  
  if (isExecutiveRole(role)) return baseCount + gsnBonus;
  if (isArchitectRole(role)) return baseCount + gsnBonus + 2;
  return baseCount + gsnBonus + 1;
}

// ============================================================================
// 9. Risk Analysis
// ============================================================================

export function generateRiskAnalysisPromptEN(): string {
  return `
## RISK ANALYSIS
Organize identified risks from these perspectives:
- Risk content and occurrence mechanism (only those documented)
- Probability and impact (only if documented - estimation prohibited)
- Implemented/planned countermeasures
- Residual risks and acceptability

Note:
- Do NOT estimate probability or impact not documented
- Describe risk causes/root causes only when documented
- When cause is unknown, state "[CAUSE UNKNOWN]"`;
}

// ============================================================================
// 10. Completeness and Accuracy
// ============================================================================

export function generateCompletenessPromptEN(): string {
  return `
## COMPLETENESS AND ACCURACY
Comprehensively utilize important information from documents and always include:
- Safety assessment results and rationale
- Unresolved issues and limitations
- Improvement proposals and future directions

Prioritize Quantitative Information:
- Use specific numbers rather than "many" or "few" (documented values only)
- Clearly describe trends in time-series data

Causal Relationship Descriptions:
- Use "because of", "due to" only when documented evidence exists
- Do NOT describe causal relationships without documented basis`;
}

// ============================================================================
// 11. Invalid File Guidelines
// ============================================================================

export function generateInvalidFileGuidelinesEN(): string {
  return `
## RESPONSE FOR INAPPROPRIATE DOCUMENTS

Condition for inappropriate judgment:
- Only when NO information related to safety, risks, hazards, or system evaluation is included

Valid document criteria:
- Text-based GSN descriptions ("G1 is...", etc.) are valid
- Documents are valid even without GSN if safety reports or risk assessments exist
- Maximize use of partial information to create report`;
}

// ============================================================================
// 12. Rhetoric Strategy Guidelines
// ============================================================================

export function getStrategyGuidelinesEN(strategy: RhetoricStrategy): string {
  const guidelines: { [key in RhetoricStrategy]: string } = {
    [RhetoricStrategy.DATA_DRIVEN]: `
- Use extensive numerical data (documented values only)
- Present visually with graphs and tables
- Make statistical evidence clear
- Causal relationships only when documented`,
    
    [RhetoricStrategy.EMOTIONAL_APPEAL]: `
- Appeal to stakeholder values
- Use success stories (only those documented)
- Use empathetic expressions`,
    
    [RhetoricStrategy.LOGICAL_REASONING]: `
- Emphasize logical flow
- Clearly show cause-and-effect relationships (only when documented)
- Use step-by-step explanations
- Do NOT make inferences without documented basis`,

    [RhetoricStrategy.AUTHORITY_BASED]: `
- Cite industry standards and regulations
- Reference expert opinions (only those documented)
- Introduce best practices`,
    
    [RhetoricStrategy.PROBLEM_SOLUTION]: `
- Clearly define problems (only those documented)
- Analyze root causes (only when documented analysis exists, otherwise "investigation required")
- Present feasible solutions`,
    
    [RhetoricStrategy.NARRATIVE]: `
- Develop in story format (based on documented facts)
- Explain history chronologically
- Connect to future vision
- Do NOT supplement story with fabrication or speculation`
  };
  
  return guidelines[strategy];
}

// ============================================================================
// 13. Report Structure Prompt
// ============================================================================

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
## REPORT STRUCTURE
Create the SSR with the following structure:
${sectionsFormatted}`;

  if (hasGSN) {
    prompt += isExecutiveRole(role)
      ? '\n\nNote: Keep GSN analysis within 1 page.'
      : '\n\nNote: Include GSN analysis section as GSN files are provided.';
  }

  if (structureDescription) {
    prompt += `\n\nStructure Description: ${structureDescription.slice(0, 500)}`;
  }

  prompt += `

### CRITICAL NOTES
- Include "Root Cause Analysis", "5 Whys Analysis" sections ONLY when documented analysis records exist in source materials
- When no documented causal analysis exists, do NOT create analysis section; instead state "[INVESTIGATION REQUIRED] Root cause identification requires additional investigation"`;

  return prompt;
}

// ============================================================================
// 14. Build Complete User Prompt
// ============================================================================

export function buildCompleteUserPromptEN(params: {
  stakeholder: Stakeholder;
  strategy: RhetoricStrategy;
  contextContent: string;
  reportSections: string[];
  hasGSN: boolean;
  structureDescription?: string;
}): string {
  const { stakeholder, strategy, contextContent, reportSections, hasGSN, structureDescription } = params;

  // Prompt assembly order (by importance - no duplicates)
  const parts = [
    // 1. Role definition
    generateSystemPromptEN(),
    
    // 2. Anti-hallucination (Critical - Top priority)
    generateAntiHallucinationPromptEN(stakeholder),
    
    // 3. Output constraints (Format, Style, Volume consolidated)
    generateOutputConstraintsEN(stakeholder),
    
    // 4. Document usage principles (including citation rules)
    generateDocumentUsagePrinciplesEN(),
    
    // 5. Stakeholder-specific settings
    generateStakeholderSectionEN(stakeholder, strategy),
    generateReportGuidelinesEN(stakeholder),
    
    // 6. Content generation guides
    generateGSNAnalysisPromptEN(hasGSN, stakeholder),
    generateFigureRequirementsPromptEN(hasGSN, stakeholder),
    generateRiskAnalysisPromptEN(),
    generateCompletenessPromptEN(),
    
    // 7. Invalid file handling (reference)
    generateInvalidFileGuidelinesEN(),
    
    // 8. Rhetoric strategy
    `\nApply the characteristics of ${strategy}:${getStrategyGuidelinesEN(strategy)}`,
    
    // 9. Provided documents
    `\n## PROVIDED DOCUMENT CONTENT\n${contextContent}`,
    
    // 10. Structure instruction
    generateStructurePromptEN(reportSections, hasGSN, stakeholder, structureDescription)
  ];

  return parts.join('\n');
}
