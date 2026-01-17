// src/lib/report-prompts-en.ts

import { Stakeholder } from '@/types';
import { RhetoricStrategy } from './report-structures';

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
   - "Tool selection decision was delayed because..." (not documented)
   - "Evaluation criteria were not established in advance because..." (not documented)
   - "Resource was allocated to other tasks because..." (not documented)
   - "Past project data was not utilized because..." (not documented)
   
   REQUIRED:
   - State only the status: "H-104 countermeasure is currently planned" (documented fact)
   - Indicate unknown cause: "[CAUSE UNKNOWN] Specific cause of delay is not documented"
   - When analysis is needed: "[INVESTIGATION REQUIRED] Root cause identification requires additional investigation"

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
  
  // Common format rules (Changed to Markdown recommended)
  const formatRules = `
## OUTPUT CONSTRAINTS (MANDATORY)

### Format (Output in Markdown)
Use Markdown notation to structure the report.

**Headings (Sections/Subsections):**
- Main heading: \`## 1. Section Name\`
- Subheading: \`### 1.1 Subsection Name\`
- Use headings ONLY for document structure (chapters, sections)

**Lists (Item Enumeration):**
- Numbered list: \`1. Item\` \`2. Item\` \`3. Item\`
- Bullet list: \`- Item\`

---

### 【CRITICAL RULE】## with numbers is ONLY for chapter headings

**Absolute Rule:**
- The \`## 1.\` format is used ONLY for **chapter titles** like "## 1. Executive Summary"
- When enumerating items, ALWAYS start with \`1.\` (without ##)

**Check before output:**
- Are you writing \`## 1.\` \`## 2.\` \`## 3.\` consecutively?
- If consecutive, it is a **list** and you MUST remove the ##

---

### FORBIDDEN Patterns (Output = Failure)

\`\`\`
[FAILURE 1] Listing rationale or criteria
**Safety Status Criteria:**
## 1. High-risk items are under mitigation
## 2. Medium-risk items are planned
## 3. Test pass rate is below target

[FAILURE 2] Listing executive decision items
**Executive Decisions Required:**
## 1. **Resource allocation decision**
## 2. **Schedule risk response**
## 3. **Quality target achievement**

[FAILURE 3] Listing weekly tasks
**Week 1 Activities:**
## 1. Complete resource adjustment
## 2. Deploy test environment
## 3. Finalize implementation schedule

[FAILURE 4] Listing delay factors
**Delay Factors:**
## 1. Self-diagnostic test failure
## 2. Test environment preparation delay
\`\`\`

---

### CORRECT Patterns (Output these)

\`\`\`
[CORRECT 1] Listing rationale or criteria
**Safety Status Criteria:**
1. High-risk items are under mitigation
2. Medium-risk items are planned
3. Test pass rate is below target

[CORRECT 2] Listing executive decision items
**Executive Decisions Required:**
1. **Resource allocation decision**
2. **Schedule risk response**
3. **Quality target achievement**

[CORRECT 3] Listing weekly tasks
**Week 1 Activities:**
1. Complete resource adjustment
2. Deploy test environment
3. Finalize implementation schedule

[CORRECT 4] Listing delay factors
**Delay Factors:**
1. Self-diagnostic test failure
2. Test environment preparation delay
\`\`\`

---

### Decision Flowchart

When about to write \`## number.\`:
1. Is this a "chapter/section title"? → Yes = \`## 1. Section Name\` is OK
2. Is this an "enumeration of items"? → Yes = Remove \`##\` and write \`1. Item name\`

**Other Notation:**
- Emphasis: Use \`**important term**\` for bold
- Tables: Use Markdown table format (| Header | Header |)
- Code or technical values: Wrap in \`backticks\`

### Style
- Use formal writing style consistently throughout`;

  // Volume constraints by stakeholder
  if (isExecutiveRole(role)) {
    return formatRules + `

### Volume (Executive Audience)
- Total pages: 8-12 pages maximum (strictly enforced)
- Total word count: 4,000-6,000 words
- Section guidelines:
  - Executive Summary: 1-2 pages
  - GSN Analysis (if included): within 1 page
  - Technical Overview: 1 page
  - Risks and Countermeasures: 2-3 pages
  - Recommendations: 1-2 pages
- Avoid redundant explanations and repetition
- MUST complete report through final section`;
  }
  
  return formatRules + `

### Volume
- Total pages: 12-15 pages maximum (strictly enforced)
- Total word count: 6,000-8,000 words
- Section guidelines:
  - Executive Summary: 1-2 pages
  - Technical Overview: 1-2 pages
  - GSN Analysis (if included): 2-3 pages
  - Risks and Countermeasures: 2-3 pages
  - Test Results: 2-3 pages
  - Improvement Proposals: 1-2 pages
- Avoid redundant explanations and repetition
- MUST complete report through final section`;
}

// ============================================================================
// 4. Redundancy Prevention Rules
// ============================================================================

export function generateRedundancyPreventionPromptEN(): string {
  return `
## REDUNDANCY PREVENTION RULES (MANDATORY)

### Fundamental Principle
Describing the same information multiple times is PROHIBITED. State information once, then reference from other sections.

### Cross-Reference Usage
Use the following patterns to reference other sections and figures/tables:
- Section reference: "As shown in Section 1", "See Section 2.3"
- Figure/Table reference: "As shown in Table 1", "See Figure 2"
- Forward/backward reference: "The aforementioned XX (Section X)", "XX discussed later (Section Y)"

### Prohibited Patterns
1. **Duplicate Data Entries**
   PROHIBITED: Re-listing numbers detailed in Executive Summary within main body
   REQUIRED: "As the key metrics in Section 1 indicate, ..."

2. **Duplicate Risk Descriptions**
   PROHIBITED: Repeating same risk explanations in both risk list and countermeasures section
   REQUIRED: Detail in "Table X: Risk List", then in countermeasures: "For H-001 (see Table X), the countermeasure is..."

3. **Duplicate Conclusions**
   PROHIBITED: Repeating same conclusions at the end of each section
   REQUIRED: Consolidate conclusions in "Recommendations" or "Summary" section

4. **Duplicate GSN Information**
   PROHIBITED: Re-explaining GSN analysis section content in other sections
   REQUIRED: "See Table X: GSN Achievement Status (Section Y)"

5. **Duplicating Figure/Table Content in Text**
   PROHIBITED: Listing all data from a figure/table in the main text
   REQUIRED: "See Table X for details" and state only key points in text

### Role Distribution Between Sections
| Section | Role | Relationship with Other Sections |
|---------|------|----------------------------------|
| Executive Summary | Conclusions and key metrics only | State "see main body for details" |
| GSN Analysis | GSN structure and achievement status | Do not re-explain elsewhere |
| Risk Analysis | Risk details | Countermeasures section references only |
| Countermeasures/Recommendations | Specific actions | Reference risks by ID number |

### Word Count Reduction Target
- Cross-referencing and figure/table numbering can reduce total word count by 20-30%
- Second and subsequent mentions of same content MUST be replaced with reference format`;
}

// ============================================================================
// 5. Document Usage Principles
// ============================================================================

export function generateDocumentUsagePrinciplesEN(): string {
  return `
## DOCUMENT USAGE PRINCIPLES

### Mandatory Extraction Items
Extract the following elements without omission and reflect in the report:
- Numerical data (statistics, measurements, occurrence counts, probabilities, percentages)
- Proper nouns (system names, project names, organization names, standard names)
- Timeline information (dates, deadlines, milestones)
- Risk-countermeasure relationships
- Responsible person/owner information
- Causal relationships and analysis results explicitly stated in documents

### Citation Rules
- Cite source for all numbers and facts: "XX (from Document ID: XXX-001)"
- Record sources for information from multiple documents
- Quote important numbers accurately from original text
- When describing causal relationships, cite the supporting document

### Priority Order
1. Explicit statements in provided documents
2. Information derivable from documents (show calculation process)
3. Explicit statements of "Not documented", "Cause unknown", "Investigation required"`;
}

// ============================================================================
// 6. Stakeholder Information
// ============================================================================

export function generateStakeholderSectionEN(stakeholder: Stakeholder, strategy: string): string {
  return `
## STAKEHOLDER INFORMATION
- Role: ${stakeholder.role}
- Primary Concerns: ${stakeholder.concerns.join(', ')}
- Rhetoric Strategy: ${strategy}`;
}

// ============================================================================
// 7. Report Creation Guidelines (By Stakeholder)
// ============================================================================

export function generateReportGuidelinesEN(stakeholder: Stakeholder): string {
  const role = stakeholder.role;
  
  if (isExecutiveRole(role)) {
    return `
## REPORT GUIDELINES (Executive Audience)
- Present information needed for executive decisions concisely
- Minimize technical details, emphasize conclusions and impacts
- Include specific, actionable recommendations
- Include causal analysis only when documented`;
  }
  
  if (isBusinessRole(role)) {
    return `
## REPORT GUIDELINES (Business Division)
- Clearly present business impacts and countermeasures
- State "[TO BE CALCULATED]" for investment/ROI unless documented
- Use only documented dates for schedule impacts
- State "[INVESTIGATION REQUIRED]" for root causes unless documented`;
  }
  
  return `
## REPORT GUIDELINES
- Focus on ${role}'s perspective and concerns
- Use technical terms as needed but explain clearly
- Provide objective analysis based on data and facts
- Include specific, actionable recommendations
- Describe causal relationships only when documented`;
}

// ============================================================================
// 8. GSN Analysis Prompt (By Stakeholder)
// ============================================================================

export function generateGSNAnalysisPromptEN(hasGSNFile: boolean, stakeholder?: Stakeholder): string {
  if (!hasGSNFile) {
    return '';
  }

  const role = stakeholder?.role || 'Safety Engineer';
  
  // Executive version (concise)
  if (isExecutiveRole(role)) {
    return `
## GSN ANALYSIS (Executive - Within 1 Page)

Consolidate into one section as follows. Do NOT create separate subsections for each node.

1. GSN Achievement Status (Table Format)
   - Major goals only (G1, G2, etc.)
   - Achievement status (Achieved/Partially Achieved/Not Achieved)
   - Business impact level (High/Medium/Low)

2. Overall Argumentation Structure Assessment (3-5 sentences)

3. Key Points for Executive Decision (3-5 items)

4. Recommended Actions (2-3 items)

PROHIBITED: Do not create separate subsections for each node; do not use more than 1 page per node
PROHIBITED: Do not fabricate causes for non-achievement without documented evidence`;
  }
  
  // Regulator version
  if (isRegulatorRole(role)) {
    return `
## GSN ANALYSIS (Regulatory Authority)

1. GSN Structure and Standards Compliance
   [Figure: GSN Node × Standard Requirements Mapping Table]

2. Major Goal Assessment
   [Figure: Goal Node Evaluation List]

3. Evidence Auditability
   [Figure: Evidence List and Verification Status]

4. Argumentation Gaps and Corrective Plans
   Note: Describe gap causes only when documented`;
  }
  
  // Architect version (detailed)
  if (isArchitectRole(role)) {
    return `
## GSN DETAILED ANALYSIS (For Designers)

1. GSN Structure Visualization
   [Figure: GSN Hierarchy Diagram]

2. Goal Node (G) Detailed Evaluation
   - Achievement status and rationale (document reference required)
   - Technical issues (only those documented)
   - Related components

3. Strategy Node (S) Evaluation
   - Decomposition validity, coverage assessment

4. Evidence Node (Sn) Technical Evaluation
   - Evidence type and strength, coverage and limitations

5. GSN-Architecture Mapping Analysis
   [Figure: GSN Node × Component Mapping Table]

6. Argumentation Gap Technical Analysis
   Note: Describe gap causes only when documented; otherwise state "[INVESTIGATION REQUIRED]"`;
  }
  
  // Default (Safety Engineer)
  return `
## GSN DETAILED ANALYSIS

1. GSN Structure Visualization
   [Figure: Complete GSN Hierarchy]

2. Goal Node (G) Evaluation
   Each goal: Achievement status, rationale (evidence reference required), issues/recommendations

3. Strategy Node (S) Evaluation
   Validity, coverage, effectiveness

4. Evidence Node (Sn) Evaluation
   Evidence type and strength, coverage and limitations

5. Overall GSN Structure Evaluation
   Argumentation completeness, logical consistency, unresolved/information-insufficient nodes

6. Argumentation Gap Analysis
   [Figure: Argumentation Gap List Table]
   Note: Describe gap causes only when documented; otherwise state "[CAUSE UNKNOWN]"`;
}

// ============================================================================
// 9. Figure Requirements (By Stakeholder)
// ============================================================================

export function generateFigureRequirementsPromptEN(hasGSNFile: boolean, stakeholder?: Stakeholder): string {
  const role = stakeholder?.role || 'Safety Engineer';
  const minFigures = getMinimumFigureCount(role, hasGSNFile);
  
  let prompt = `
## FIGURE/TABLE REQUIREMENTS

### Required Figures (2)
1. [Figure: Safety Assessment Results Summary]
2. [Figure: Hazard-Countermeasure Mapping Table]`;

  if (isExecutiveRole(role)) {
    prompt += `

### Recommended for Executives
3. Safety Dashboard (achievement rate, status)
4. Risk Heatmap`;
  } else if (isArchitectRole(role)) {
    prompt += `

### Recommended for Designers
3. System Architecture Diagram
4. Component-wise Risk Mapping
5. Technical Specification Compliance Table`;
  } else {
    prompt += `

### Recommended Figures
3. Detailed Risk Assessment Matrix
4. Verification Coverage Table`;
  }

  if (hasGSNFile) {
    prompt += isExecutiveRole(role) 
      ? `\n\n### GSN Related: GSN Achievement Status Table (1 only)`
      : `\n\n### GSN Related: GSN Hierarchy Diagram, GSN Node Relationship Matrix`;
  }

  prompt += `

### Figure Count: Minimum ${minFigures}, Recommended ${minFigures + 2}-${minFigures + 4}

### Figure/Table Numbering System (MANDATORY)
Assign sequential numbers and titles to all figures and tables.

**For Tables:**
- Format: "Table X: Title" (e.g., Table 1: Risk List, Table 2: GSN Achievement Status)
- Create tables in Markdown format
- Reference from text: "As shown in Table 1", "See Table 2"

**For Figures:**
- Format: "Figure X: Title" (e.g., Figure 1: System Architecture, Figure 2: GSN Hierarchy)
- Since figures cannot be created, use placeholder format:
  \`\`\`
  [Figure 1: System Architecture]
  * This figure shows the overall system configuration. Illustrate main components and their connections.
  \`\`\`
- Reference from text: "As shown in Figure 1", "See Figure 2"

### Figure/Table Insertion Rules
- Use sequential numbering throughout the document (Table 1, Table 2..., Figure 1, Figure 2...)
- Assign number and title at first appearance
- Subsequent references use number only (re-explanation of content prohibited)
- State "Cannot illustrate due to insufficient information" when data is lacking
- All figure/table data must be from documents (fabrication prohibited)`;

  return prompt;
}

function getMinimumFigureCount(role: string, hasGSN: boolean): number {
  const baseCount = 4;
  const gsnBonus = hasGSN ? 1 : 0;
  
  if (isExecutiveRole(role)) return baseCount + gsnBonus;
  if (isArchitectRole(role)) return baseCount + gsnBonus + 2;
  return baseCount + gsnBonus + 1;
}

// ============================================================================
// 10. Risk Analysis
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
// 11. Completeness and Accuracy
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
// 12. Invalid File Guidelines
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
// 13. Rhetoric Strategy Guidelines
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
// 14. Report Structure Prompt
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
// 15. Build Complete User Prompt
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
    
    // 4. Redundancy prevention rules (NEW)
    generateRedundancyPreventionPromptEN(),
    
    // 5. Document usage principles (including citation rules)
    generateDocumentUsagePrinciplesEN(),
    
    // 6. Stakeholder-specific settings
    generateStakeholderSectionEN(stakeholder, strategy),
    generateReportGuidelinesEN(stakeholder),
    
    // 7. Content generation guides
    generateGSNAnalysisPromptEN(hasGSN, stakeholder),
    generateFigureRequirementsPromptEN(hasGSN, stakeholder),
    generateRiskAnalysisPromptEN(),
    generateCompletenessPromptEN(),
    
    // 8. Invalid file handling (reference)
    generateInvalidFileGuidelinesEN(),
    
    // 9. Rhetoric strategy
    `\nApply the characteristics of ${strategy}:${getStrategyGuidelinesEN(strategy)}`,
    
    // 10. Provided documents
    `\n## PROVIDED DOCUMENT CONTENT\n${contextContent}`,
    
    // 11. Structure instruction
    generateStructurePromptEN(reportSections, hasGSN, stakeholder, structureDescription)
  ];

  return parts.join('\n');
}