// lamdba/src/lib/report-prompts-en.ts
// v5: Redundancy/duplication reduction refactoring
//   - Consolidated hallucination prevention rules into single authoritative source
//   - Merged term handling (old 7b) and plain language guide (old 7c)
//   - Reduced format failure examples from 4 to 2
//   - Merged generateCompletenessPrompt into generateDocumentUsagePrinciples
//   - Added common GSN analysis notes as batch
//   - Removed duplicated "causal relationships only when documented" etc. from individual functions

import { FocusGsnNodeInput, HeatmapGsnNodeInput, HeatmapRiskInput, SafetyVerdictInput, Stakeholder } from '../types';
import { STAKEHOLDER_PROFILE_MAP, formatCategoryDefinitions, formatLayerDefinitions, gsnCategoryLabel } from './gsn-categories';
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
  const architectKeywords = ['architect', 'designer', 'developer', 'technical'];
  return architectKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

function isBusinessRole(role: string): boolean {
  const businessKeywords = ['business', 'sales', 'marketing', 'planning', 'commercial'];
  return businessKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

function isTechnicalExpertRole(role: string): boolean {
  const technicalKeywords = [
    'technical fellows', 'architect',
    'engineer', 'developer', 'r&d',
    'safety engineer', 'qa', 'quality'
  ];
  return technicalKeywords.some(keyword => role.toLowerCase().includes(keyword));
}

function isNonExpertRole(role: string): boolean {
  return !isTechnicalExpertRole(role) && !isRegulatorRole(role);
}

/**
 * Determines whether a stakeholder is an expert.
 * Uses existing id and role for determination; no type changes required.
 */
function isExpertStakeholder(stakeholder?: Stakeholder): boolean {
  if (!stakeholder) return false;
  
  // 1. Determination by preset ID
  const EXPERT_IDS = ['technical-fellows', 'architect', 'r-and-d'];
  const NON_EXPERT_IDS = ['cxo', 'business'];
  // 'product' intentionally excluded from both → falls through to keyword check
  
  if (EXPERT_IDS.includes(stakeholder.id)) return true;
  if (NON_EXPERT_IDS.includes(stakeholder.id)) return false;
  
  // 2. Custom stakeholders etc.: determine by role name keywords
  const role = stakeholder.role.toLowerCase();
  const expertKeywords = [
    'engineer', 'architect', 'developer', 'technical', 'r&d', 'research',
    'scientist'
  ];
  
  if (expertKeywords.some(k => role.includes(k))) return true;
  
  // Default: lean toward non-expert (to avoid risk of omitting term explanations)
  return false;
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
// 2. Anti-Hallucination + Fidelity/Consistency (Single Authoritative Source)
// ============================================================================
// [Design Policy]
// Rules for causal relationship prohibition, unknown cause disclosure, document evidence
// requirements, etc. are all consolidated in this function.
// Other functions only reference: "※ Comply with Anti-Hallucination Rules (Section 2)"

export function generateAntiHallucinationPromptEN(stakeholder?: Stakeholder): string {
  const role = stakeholder?.role || '';
  
  let basePrompt = `
## ANTI-HALLUCINATION RULES (MANDATORY COMPLIANCE)

### Fundamental Principle
Information not explicitly stated in the provided documents MUST NEVER be generated, estimated, or fabricated.

### Prohibited Information Categories

The following categories of information are prohibited unless documented.
When information is insufficient, use the standard phrases shown in the "Response" column.

| # | Category | Prohibited Example | Response |
|---|----------|-------------------|----------|
| 1 | Costs / Budget / Investment | "approximately $200K", "cost of $100K" | "[ESTIMATE NEEDED] Cost not documented in provided materials" |
| 2 | Specific Durations / Delay Predictions | "2-4 weeks delay" | Use only documented dates, or "[TO BE CONFIRMED]" |
| 3 | Headcount / Resource Numbers | "5 engineers required" | "[TO BE CALCULATED]" |
| 4 | ROI / Return on Investment | "ROI: High" | "[OUT OF SCOPE] ROI evaluation is outside the scope of this report" |
| 5 | Self-calculated Values | Unfounded "achievement rate 73.3%" | Quote documented values directly; show calculation formula if deriving |
| 6 | Market Predictions / Business Impact | "market share will decrease by X%" | Document stated facts only |
| 7 | Figure/Table Data | Creating figures with undocumented values | State "Cannot illustrate due to insufficient information" |

### Table (Markdown Table) Transcription Rules [All Stakeholders]

Tables are "transcription tables" — filling cells with supplemented or guessed content is strictly prohibited.

**Prohibited:**
- Filling cells with undocumented values ("plausible-looking values")
- Auto-correcting notation variations in dates, names, IDs, numbers, or pass/fail status
- Generating undocumented IDs, rows, or columns by guessing

**Required:**
- Transcribe dates, names, IDs, numbers, and pass/fail status exactly as written in provided documents
- For unknown cells, do not leave blank — use "[NOT DOCUMENTED]", "[TO BE CONFIRMED]", or "—" consistently
- Before output, verify that dates, names, and IDs in tables match document records; replace mismatches with "[TO BE CONFIRMED]"

### Causal Relationship / Root Cause Analysis Rules [CRITICAL]

**Prohibited:**
- Fabricating answers to "why" questions not in documents
- Creating 5 Whys analysis or root cause analysis without documented records
- Using causal expressions like "because of", "due to", "caused by" without documented evidence
- Fabricating structural problems or organizational issues based on speculation (e.g., "decision-making process delay", "budget allocation rigidity")

**Required:**
- State only the status: "The countermeasure for H-104 is currently planned" (documented fact)
- Indicate unknown cause: "[CAUSE UNKNOWN] The specific cause of the delay is not documented"
- When analysis is needed: "[INVESTIGATION REQUIRED] Root cause identification requires additional investigation"

### Evidence Strength-Based Expression Rules

Use different levels of confidence based on the strength of evidence.

**Level 1: Clear statement in document (assertion permitted)**
- Expressions: "is", "is stated as", "is documented as"
- Example: "The countermeasure for H-001 has been implemented (Document X)"

**Level 2: Logically derivable from document statements (use qualified expressions)**
- Expressions: "Based on document statements, it can be determined that...", "It can be interpreted as..."
- Required: Always cite the supporting document statement

**Level 3: Not stated in document (description prohibited)**
- Response: Use "[NOT DOCUMENTED]" or "[TO BE CONFIRMED]" tags
- Speculative expressions such as "it is presumed that..." or "probably..." are also prohibited

**Dangerous expressions suggesting certainty (verify evidence before use):**
- "Clearly..." "Obviously..." → Is there Level 1 evidence?
- "Must be..." "Should be..." → Speculation presented as assertion. Prohibited.
- "Judging comprehensively..." → Can the basis for judgment be individually specified?
- "Is required" "Is essential" → Is it documented as a requirement?

### Cross-Section Consistency Rules

**Consistency of identical facts:**
- Use the same expression for the same hazard/risk evaluation across all sections
- Ensure numerical values (pass rates, counts, etc.) are consistent across all sections

**Consistency of evaluations:**
- Do not describe something as "minor" in one section if it was characterized as "critical risk" in another
- Ensure overall evaluations and individual section evaluations do not contradict each other
- When ranking risks ("the largest risk", "top priority", etc.), state the criterion (severity, score, priority, etc.). If you call a risk the largest while a different risk has the highest score on the risk heatmap, also mention the highest-scoring risk and explain how the two are treated differently
- If a hazard and its corresponding risk (e.g. H-101 and R-101) have different status wordings in the documents, do not pick one; show both and mark [TO BE CONFIRMED]

**Consistency of schedules:**
- When proposing or describing a change to a milestone date, align the dates of every dependent milestone and task on the same assumption everywhere in the report (tables, next steps, decision items)
- If the documents do not give the new dates, write the dependent dates as "[TO BE REPLANNED]" instead of presenting the old dates as the new plan

### Permitted Statements
- Direct quotation of documented values (with source citation)
- Calculations derivable from documented values (show calculation process)
- Quotation of causal relationships explicitly stated in documents
- General industry knowledge with "[REFERENCE]" tag
- Explicit statements of "Not documented", "To be confirmed", "Cause unknown"

### Standard Phrases for Information Gaps
- Cost: "[ESTIMATE NEEDED] Cost is not documented; separate estimation required"
- Duration: "[TO BE CONFIRMED] Specific duration not documented"
- Evaluation: "[OUT OF SCOPE] XX is outside the scope of this report"
- Details: "[DETAILS UNKNOWN] Details of XX are not documented"
- Cause: "[CAUSE UNKNOWN] Cause of XX is not documented"
- Investigation: "[INVESTIGATION REQUIRED] Identification of XX requires additional investigation"

### Pre-Output Checklist
□ Costs/expenses/durations/ROI/calculated values/headcount → Is there documented evidence?
□ Figure/table values → All from documented sources?
□ Table cells → Accurately transcribed from documents?
□ "because of", "due to" → Is this causal relationship explicitly documented?
□ Assertive expressions → Is there Level 1 evidence?
□ Does the Executive Summary conclusion match the analysis results in the main body?
□ Are risk severity ratings and cited numbers consistent across all sections?`;

  // Business/Executive additional warning
  if (isBusinessRole(role) || isExecutiveRole(role)) {
    basePrompt += `

### Special Warning for ${role}
The following information affecting business/executive decisions must be handled with extra rigor:
- NEVER generate specific cost/expense figures
- Do NOT evaluate ROI/investment returns (state "separate calculation required")
- Do NOT predict specific delay durations for market launch
- Do NOT estimate opportunity costs or risk amounts
- When needed, list items only with "[TO BE CALCULATED]", "[ESTIMATE NEEDED]", or "[INVESTIGATION REQUIRED]"`;
  }

  // Architect/Technical expert additional warning
  if (isArchitectRole(role) || isTechnicalExpertRole(role)) {
    basePrompt += `

### Special Warning for ${role}: Accurate Table Data Transcription [CRITICAL]

Architect/technical reports include detailed tables (test result lists, traceability matrices, etc.),
and data within tables MUST be transcribed verbatim from provided documents.

**Test Result Table Creation Rules (Strictly Enforced):**
1. Transcribe test IDs (TR-XXX), execution dates, executors, and results (PASS/FAIL/PENDING) exactly as documented
2. Filling dates with "plausible values" is STRICTLY PROHIBITED
3. Do NOT alter or fabricate executor names
4. When failure reasons/corrective actions are documented, transcribe them accurately without omission
5. Writing "[DETAILS UNKNOWN]" when failure reasons ARE documented is STRICTLY PROHIBITED

**Procedure for filling each table cell:**
1. Search for the corresponding test ID / hazard ID / requirement ID in provided documents
2. Copy the documented value exactly
3. Use "—" or "[NOT DOCUMENTED]" ONLY when the information is genuinely not found in documents
4. NEVER fill values from guessing or memory

**Conditions for using "[DETAILS UNKNOWN]" tag:**
- May be used ONLY when the information cannot be found after searching provided documents
- Must re-check the full text of provided documents before use
- Labeling as "details unknown" when the information exists in documents constitutes concealment of facts and is prohibited`;
  }

  return basePrompt;
}

// ============================================================================
// 3. Output Constraints (Format, Style, Volume)
// ============================================================================

export function generateOutputConstraintsEN(stakeholder?: Stakeholder): string {
  const role = stakeholder?.role || 'Safety Engineer';
  const expert = isExpertStakeholder(stakeholder);
  
  // Common format rules
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

### [CRITICAL RULE] ## with numbers is ONLY for chapter headings

**Absolute Rule:**
- The \`## 1.\` format is used ONLY for **chapter titles** like "## 1. Executive Summary"
- When enumerating items, ALWAYS start with \`1.\` (without ##)

**Check before output:**
- Are you writing \`## 1.\` \`## 2.\` \`## 3.\` consecutively?
- If consecutive, it is a **list** and you MUST remove the ##

---

### Prohibited and Correct Patterns

\`\`\`
[FAILURE] Using ## for item enumeration
**Safety Status Criteria:**
## 1. High-risk items are under mitigation
## 2. Medium-risk items are planned

[CORRECT] Using numbers only for item enumeration
**Safety Status Criteria:**
1. High-risk items are under mitigation
2. Medium-risk items are planned
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

  // Non-expert: plain language priority hook (detailed rules defined in Section 7)
  const accessibilityHook = isNonExpertRole(role)
    ? `\n- For non-expert audience: Prioritize plain language over technical jargon; aim for sentences of 20 words or fewer (details in Section 7)`
    : '';

  // ★ Appendix rules
  const appendixRules = expert
    ? `

### Appendix Rules
- Do NOT include a Glossary (readers are experts; definition explanations are unnecessary)
- A minimal abbreviation list table may be included in the appendix ONLY when there are many project-specific abbreviations
- Appendices are limited to reference data and supplementary figures/tables that would otherwise bloat the main text`
    : `

### Appendix Rules
- If technical terms or abbreviations are used in the report body, include a Glossary as an appendix
- The Glossary should include (only terms, abbreviations, and symbols actually used in the body; omit anything that does not appear there):
  - Technical terms used in the body with plain language explanations
  - Abbreviations with their full forms
- The Glossary does NOT count toward the main text volume constraints (page/word count)
- In the body, add brief annotations at first occurrence and direct readers to "See Appendix: Glossary" for details`;

  // Volume constraints by stakeholder
  if (isExecutiveRole(role)) {
    return formatRules + appendixRules + `

### Volume (Executive Audience)
- Total pages: 8-12 pages maximum (strictly enforced)
- Total word count: 4,000-6,000 words
- Section guidelines:
  - Executive Summary: 1-2 pages
  - GSN Analysis (if included): within 1 page
  - Technical Overview: 1 page
  - Risks and Countermeasures: 2-3 pages
  - Recommendations: 1-2 pages
- MUST complete report through final section${accessibilityHook}`;
  }
  
  return formatRules + appendixRules + `

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
- MUST complete report through final section${accessibilityHook}`;
}

// ============================================================================
// 4. Redundancy Prevention Rules + Information Density Optimization
// ============================================================================

export function generateRedundancyPreventionPromptEN(stakeholder?: Stakeholder): string {
  const expert = isExpertStakeholder(stakeholder);

  const basePart = `
## REDUNDANCY PREVENTION RULES (MANDATORY)

### Fundamental Principle
Describing the same information multiple times is PROHIBITED. State information once, then reference from other sections.

### Information Density

**Per-paragraph rule:**
- Each paragraph must contain at least one "new piece of information, analysis, or insight"
- Delete paragraphs that contain no new information

**Prohibited filler expressions:**
- Meta-references: "This section discusses...", "The following explains..."
- Unnecessary preambles: "Importantly, ...", "It is noteworthy that...", "A notable point is..."
- Re-summarizing prior content: "Based on the above...", "As mentioned above...", "As previously stated..." (replace with reference format: "See Section X")
- Self-evident generalities: "Safety is important", "Risk management is essential", etc.

**Section opening rule:**
- Do NOT begin with a summary of the previous section (replace with reference: "Based on the analysis in Section X, ...")
- Keep introductory sentences to one sentence or fewer; proceed immediately to the main content

### Cross-Reference Usage
- Section reference: "As shown in Section 1", "See Section 2.3"
- Figure/Table reference: "As shown in Table 1", "See Figure 2"
- Forward/backward reference: "The aforementioned XX (Section X)", "XX discussed later (Section Y)"

### Prohibited Patterns
1. **Duplicate data entries** → "As the key metrics in Section 1 indicate, ..." (use reference)
2. **Duplicate risk descriptions** → "For H-001 (see Table X), the countermeasure is..."
3. **Duplicate conclusions** → Consolidate conclusions in "Recommendations" or "Summary" section
   - Keep the body of each recommended action / decision item in one place (the Recommendations chapter). In the Executive Summary or GSN analysis, give only the item name and a reference (e.g. "item 1 in Section 6.1") without repeating the explanation
   - Do not list the same matter twice as separate recommendations (e.g. requirement SR-108 and its corresponding hazard H-108)
4. **Duplicate GSN information** → "See Table X: GSN Achievement Status (Section Y)"
5. **Duplicating figure/table content in text** → "See Table X for details" and state only key points in text`;

  // ★ Section role distribution by expertise level
  const sectionRoles = expert
    ? `

### Role Distribution Between Sections
| Section | Content to Include | Content to Omit |
|---------|-------------------|-----------------|
| Executive Summary | Technical conclusions, key metrics | Detailed analysis (defer to main body) |
| Technical Overview | Design decisions, technology selection rationale | Basic concept explanations |
| GSN Analysis | Per-node achievement status, evidence evaluation | Explanation of GSN methodology itself |
| Risks and Countermeasures | Technical risk details, countermeasure adequacy | General risk management theory |
| Test Results | Data, pass/fail determinations, coverage | Textbook-style test methodology explanations |
| Improvement Proposals | Implementable improvements with priorities | Repeated summaries of other sections |

#### Expert Reader Focus Rules
- Do NOT include concept definitions in the form "XX is a method that..." (readers have equivalent expertise)
- Explanations of industry-standard terms (FMEA, FTA, ASIL, CI/CD, etc.) are unnecessary
- Expand project-specific abbreviations only once at first occurrence`

    : `

### Role Distribution Between Sections
| Section | Content to Include | Content to Omit |
|---------|-------------------|-----------------|
| Executive Summary | Conclusions, metrics needed for decisions, recommended actions | Detailed technical mechanisms |
| Current Status/Technical Overview | Only key points affecting the reader's decisions | Implementation methods, algorithm details |
| GSN Analysis | Achievement/non-achievement ratios and impact | Detailed technical evaluation of individual nodes |
| Risks and Countermeasures | High-impact risks and specific responses | Implementation procedures for countermeasures |
| Recommendations | Prioritized actions, items requiring decisions | Repeated summaries of other sections |

#### Non-Expert Reader Focus Rules
- Convert technical terms to impacts/outcomes (e.g., ✗ "Latency exceeds threshold" → ✓ "Response time does not meet requirements")
- Each section should provide unique decision-making material; do not repeat the same fact from different angles`;

  return basePart + sectionRoles + `

### Word Count Reduction Target
- Cross-referencing and figure/table numbering can reduce total word count by 20-30%
- Second and subsequent mentions of same content MUST be replaced with reference format`;
}

// ============================================================================
// 5. Document Usage Principles (Merged from old "Completeness and Accuracy")
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

### Information Priority Order
1. Explicit statements in provided documents
2. Information derivable from documents (show calculation process)
3. Explicit statements of "Not documented", "Cause unknown", "Investigation required"

### Comprehensiveness
The report must include the following:
- Safety assessment results and rationale
- Unresolved issues and limitations
- Improvement proposals and future directions

### Prioritize Quantitative Information
- Use specific numbers rather than "many" or "few" (documented values only)
- Clearly describe trends in time-series data

### Pre-Output Comprehensiveness Check
□ Are "rationale (why it is safe)", "unresolved issues", and "next actions" each described at least once in the report?

※ Causal relationship description rules comply with Anti-Hallucination Rules (Section 2).`;
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
// 7. Report Creation Guidelines (By Stakeholder) + Terms/Plain Language (Merged)
// ============================================================================
// [Design Policy]
// Merged old 7b (term handling) and old 7c (plain language guide).
// Causal relationship rules are unified as Section 2 reference.

export function generateReportGuidelinesEN(stakeholder: Stakeholder): string {
  const role = stakeholder.role;
  
  if (isExecutiveRole(role)) {
    return `
## REPORT GUIDELINES (Executive Audience)
- Present information needed for executive decisions concisely
- Minimize technical details, emphasize conclusions and impacts
- Include specific, actionable recommendations

※ Causal relationship/root cause descriptions must comply with Anti-Hallucination Rules (Section 2).

${generateTermAndAccessibilityRulesEN(role)}`;
  }
  
  if (isBusinessRole(role)) {
    return `
## REPORT GUIDELINES (Business Division)
- Clearly present business impacts and countermeasures
- State "[TO BE CALCULATED]" for investment/ROI unless documented
- Use only documented dates for schedule impacts

※ Causal relationship/root cause descriptions must comply with Anti-Hallucination Rules (Section 2).

${generateTermAndAccessibilityRulesEN(role)}`;
  }

  if (isTechnicalExpertRole(role)) {
    return `
## REPORT GUIDELINES (Technical Expert Audience)
- Focus on ${role}'s perspective and concerns
- Prioritize technical accuracy above all
- Provide objective analysis based on data and facts
- Include specific, actionable recommendations
- When creating test result/verification tables, transcribe accurately from documents (see Section 2 transcription rules)

${generateTermAndAccessibilityRulesEN(role)}`;
  }
  
  // ★ Expert / Non-expert branching
  if (isExpertStakeholder(stakeholder)) {
    return `
## REPORT GUIDELINES
- Provide technical analysis from ${role}'s expert perspective
- Use technical terms directly (readers have equivalent expertise; definition explanations are unnecessary)
- Expand project-specific abbreviations with their full form only once at first occurrence
- Provide objective technical evaluation based on data and facts
- Include specific, implementable improvement proposals
- Describe causal relationships only when documented evidence exists
- Do NOT include general concept explanations (in the form "XX is a method that...")

${generateTermAndAccessibilityRulesEN(role)}`;
  }
  
  // Non-expert default (Product, custom non-experts, etc.)
  return `
## REPORT GUIDELINES
- Focus on ${role}'s perspective and concerns
- Replace technical terms with plain language where possible, or add brief annotations at first occurrence
- Convert technical content to "what is happening" and "how it impacts" descriptions
- Provide objective analysis based on data and facts
- Include specific, actionable recommendations
- Describe causal relationships only when documented evidence exists

※ Causal relationship/root cause descriptions must comply with Anti-Hallucination Rules (Section 2).

${generateTermAndAccessibilityRulesEN(role)}`;
}

// ============================================================================
// 7b. Term Handling + Plain Language Guide (Merged)
// ============================================================================
// [Design Policy]
// Merged old 7b (generateTermHandlingRules) and old 7c (generateAccessibilityPrompt).
// Non-expert rewriting example table unified into one, duplicates removed.

function generateTermAndAccessibilityRulesEN(role: string): string {
  if (isTechnicalExpertRole(role)) {
    return `### Term Usage (Technical Expert Audience)
- Standard safety engineering terms (GSN, ASIL, FMEA, FTA, HAZOP, etc.) need no definition
- Expand only project-specific abbreviations and proper nouns at first occurrence
- Example: "SCS (Safety Critical System)" expanded only at first occurrence; use "SCS" thereafter`;
  }

  if (isRegulatorRole(role)) {
    return `### Term Usage (Regulatory Authority)
- Write full formal names of standards/regulations at first occurrence: "ISO 26262 (Road vehicles — Functional safety)"
- Use abbreviations only thereafter
- Use regulatory/standard-specific terms as-is (to prevent meaning changes from simplification)`;
  }

  // Non-expert (executives, business divisions, others): merged term definitions + plain language
  return `### Term and Expression Usage (Non-Expert Audience)

**First-occurrence definition rule:**
- Add a plain language definition in parentheses at first occurrence of technical terms
- From the second occurrence onward, use the term only without re-defining
- Definitions should be short annotations within parentheses (one line or less)

**Term rewriting examples:**
| Technical Expression | Plain Language Expression |
|---------------------|-------------------------|
| GSN (Goal Structuring Notation) | Safety argumentation structure diagram (GSN) |
| Goal Node (G) | Safety objective (Goal: G) |
| Strategy Node (S) | Argumentation approach (Strategy: S) |
| Evidence Node (Sn) | Evidence supporting safety (Evidence: Sn) |
| Context Node (C) | Precondition (Context: C) |
| Undeveloped Node (U) | Part where evidence is not yet prepared (Undeveloped: U) |
| Argumentation gap | Remaining hole in the safety explanation (argumentation gap) |
| Fault-tolerant design | Design that continues operating even when a part fails (fault-tolerant design) |
| Verification compliant with ASIL-D | Verification based on the strictest safety standard (ASIL-D) |
| Conducted hazard analysis | Identification of risk factors (hazard analysis) conducted |
| Acceptability of residual risk | Whether risk remaining after countermeasures is within acceptable range |
| Insufficient evidence coverage | Some evidence supporting safety (test results, etc.) is not yet available |
| Safety argumentation completeness not ensured | There are gaps in the explanation of why the system is safe |

**Sentence structure:**
- Aim for sentences of 20 words or fewer; split longer sentences
- Keep subjects and verbs close together
- Avoid double negatives ("It cannot be said that it is not..." → "It is possible that...")

**Conveying numbers:**
- Add meaning beyond raw data: "Pass rate 85% (5 percentage points below the 90% target)"
- Supplement ratios with concrete examples: "3 out of 10 (30%) are incomplete"

**Conveying technical concepts:**
- Explain in order of "what" then "why it matters (so what)"
- Avoid abstract expressions; state specific impacts and outcomes

**Prohibited:**
- Do not include 3 or more undefined technical terms in a single sentence
- Do not re-explain terms that have already been defined (causes redundancy)
- Do not write definitions spanning more than 2 lines within parentheses`;
}

// ============================================================================
// 8. GSN Analysis Prompt (By Stakeholder)
// ============================================================================

// GSN Primer (for non-experts)
function generateGSNPrimerForNonExperts(): string {
  return `
### GSN Reading Guide (For Non-Expert Readers — Insert at Report Beginning)

For readers unfamiliar with GSN, insert a **short note** at the beginning of the report (before the Executive Summary).
Do not make it a standalone section; write it as a brief introductory note of a few lines.

**Content to include in the note (all of the following elements):**
1. This report uses a method called GSN (Goal Structuring Notation) to organize safety claims and evidence
2. Meaning of symbols appearing in the text (format example only; list only the node types that actually exist in the provided GSN — e.g. omit the C line if there are no Context nodes):
   - G1, G1.1, etc. = Safety objectives (Goals)
   - S1, etc. = Argumentation approaches (Strategies)
   - Sn1, etc. = Evidence supporting safety (Evidence)
   - C1, etc. = Preconditions (Contexts)
   - U1, etc. = Items not yet completed (Undeveloped)
3. These are reference numbers used in GSN
4. The report is structured so that readers can understand the content by following the explanations, even without GSN knowledge

**Writing rules:**
- Keep to approximately 3-5 sentences (within half a page)
- Do NOT make it a standalone section (no ## heading)
- Present as a note/supplement (e.g., prefix with "About reading this report:" or similar)
- Use symbols (G1, Sn1, etc.) that match the GSN structure in the provided documents`;
}

// Common GSN analysis note (all stakeholders)
function appendGSNCommonNote(prompt: string): string {
  return prompt + `

※ Gap causes and reasons for non-achievement must comply with Anti-Hallucination Rules (Section 2); describe only when documented. If not documented, state "[CAUSE UNKNOWN]" or "[INVESTIGATION REQUIRED]".`;
}

export function generateGSNAnalysisPromptEN(hasGSNFile: boolean, stakeholder?: Stakeholder): string {
  if (!hasGSNFile) {
    return '';
  }

  const role = stakeholder?.role || 'Safety Engineer';
  const gsnPrimer = isNonExpertRole(role) ? generateGSNPrimerForNonExperts() : '';
  
  // Executive version (concise)
  if (isExecutiveRole(role)) {
    return appendGSNCommonNote(`
${gsnPrimer}
## GSN ANALYSIS (Executive — Within 1 Page)

Consolidate into one section as follows. Do NOT create separate subsections for each node.

1. GSN Achievement Status (Table Format)
   - Major goals only (G1, G2, etc.)
   - Achievement status (Achieved/Partially Achieved/Not Achieved)
   - Business impact level (High/Medium/Low)

2. Overall Argumentation Structure Assessment (3-5 sentences)

3. Key Points for Executive Decision (3-5 items)

4. Recommended Actions (2-3 items; if identical to the Recommendations chapter, give only the item name and a reference)

PROHIBITED: Do not create separate subsections for each node; do not use more than 1 page per node`);
  }
  
  // Regulator version
  if (isRegulatorRole(role)) {
    return appendGSNCommonNote(`
## GSN ANALYSIS (Regulatory Authority)

1. GSN Structure and Standards Compliance
   [Figure: GSN Node × Standard Requirements Mapping Table]

2. Major Goal Assessment
   [Figure: Goal Node Evaluation List]

3. Evidence Auditability
   [Figure: Evidence List and Verification Status]

4. Argumentation Gaps and Corrective Plans`);
  }
  
  // Architect version (detailed)
  if (isArchitectRole(role)) {
    return appendGSNCommonNote(`
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

6. Argumentation Gap Technical Analysis`);
  }

  // Non-expert audience (business divisions, other general)
  if (isNonExpertRole(role)) {
    return appendGSNCommonNote(`
${gsnPrimer}
## GSN ANALYSIS (For ${role})

Using the symbols (G, S, Sn, etc.) introduced in the reading guide above, structure the analysis as follows.
At the first occurrence of each symbol, pair it with a plain language name as in the reading guide (e.g., "Safety objective G7", "Evidence Sn1").

1. Overview of the Safety Argumentation
   - Outline the structure of the project's safety argumentation (number of nodes, key branching points)
   - [Figure: Safety Argumentation Hierarchy Diagram]

2. Safety Objective (Goal) Achievement Status
   [Figure: Safety Objective Achievement Status Table]
   - Organize the achievement status of each objective in table format
   - Clearly define the categories "Achieved", "In Progress", and "Not Achieved" and their meanings

3. Evidence Readiness Status
   - Organize completed evidence and outstanding evidence
   - Explain in plain language how outstanding evidence affects the safety assessment

4. Safety Argumentation Gaps and Impact
   - Explain where incomplete items and outstanding evidence create holes in the "safety explanation"
   - Impact level of each gap (High/Medium/Low)

5. Recommended Actions (2-4 items; if identical to the Recommendations chapter, give only the item name and a reference)

Note: Do not use GSN jargon; consistently use the plain language expressions defined in the reading guide above`);
  }
  
  // Default (Safety Engineer)
  return appendGSNCommonNote(`
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
   [Figure: Argumentation Gap List Table]`);
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
- **Exception: Risk Heatmap / Risk Assessment Matrix** must NOT be a placeholder; output it as the \`risk-heatmap\` code block defined in the RISK ANALYSIS section (the system renders it)
- **Exception: GSN Node Heatmap** (when a GSN file is provided) must NOT be a placeholder either; output it as the \`gsn-heatmap\` code block defined below (the system renders it)
- Do not write a \`[Figure X: ... Heatmap]\` placeholder line for heatmaps (put the figure number in the block's title)

### Figure/Table Insertion Rules
- Use sequential numbering throughout the document (Table 1, Table 2..., Figure 1, Figure 2...)
- Assign number and title at first appearance
- Subsequent references use number only (re-explanation of content prohibited)
- State "Cannot illustrate due to insufficient information" when data is lacking
- All figure/table data must be from documents (see Anti-Hallucination Rules, Section 2)`;

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

function formatRiskLineEN(risk: HeatmapRiskInput): string {
  const fmt = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? 'not documented' : String(v));
  const categories = (risk.categories ?? [])
    .map((c) => `${gsnCategoryLabel(c, 'en')}${c === risk.primaryCategory ? ' (primary)' : ''}`)
    .join(', ');
  return `- ${risk.id}${risk.name ? `: ${risk.name}` : ''} (likelihood: ${fmt(risk.likelihood)} / impact: ${fmt(risk.impact)} / status: ${fmt(risk.status)}${categories ? ` / categories: ${categories}` : ''})`;
}

/**
 * Instruction for the risks the user selected on the risk heatmap
 * (empty string when nothing was specified = previous behavior)
 */
function generateFocusRiskPromptEN(
  heatmapRisks?: HeatmapRiskInput[],
  focusRiskIds?: string[],
  stakeholderCategories?: string[]
): string {
  if (!heatmapRisks || heatmapRisks.length === 0) return '';

  const focusSet = new Set(focusRiskIds ?? []);
  const focus = heatmapRisks.filter((r) => focusSet.has(r.id));
  const others = heatmapRisks.filter((r) => !focusSet.has(r.id));
  const blockJson = JSON.stringify({
    title: 'Figure X: Risk Heatmap',
    ...(stakeholderCategories && stakeholderCategories.length > 0 ? { stakeholderCategories } : {}),
    risks: heatmapRisks,
  });

  return `

### RISKS TO COVER IN THIS REPORT (USER-SPECIFIED, HIGHEST PRIORITY)
On the risk heatmap, the user selected the risks this report must describe for its reader.
This selection takes precedence over stakeholder-specific filtering and length rules.

**Risks that MUST be described (${focus.length})**: discuss each one individually in the body, always with its risk ID. Explain its content, likelihood, impact, and mitigation status within what the documents state. For risks with categories, add what the risk means for the reader (what needs a decision, explanation, or action) from the viewpoint of those categories, especially the primary one.
${focus.length > 0 ? focus.map(formatRiskLineEN).join('\n') : '- none'}

**All other risks (${others.length})**: do not discuss them individually; mention them only as a count (e.g. "${others.length} other risks"). Do not write their risk IDs or individual names in the body.
- Statistics / breakdown tables (by priority, status, impact, etc.) show counts only, with no ID column
- Do not write IDs in the omission note either (NG: "the other ${others.length} risks (R-xxx, R-yyy) are omitted" → OK: "the other ${others.length} risks are not detailed individually")

**risk-heatmap block**: use the following list (all risks extracted from the documents) as \`risks\` exactly as given (only adjust the figure number in title to match the document numbering).
\`\`\`risk-heatmap
${blockJson}
\`\`\``;
}

export function generateRiskAnalysisPromptEN(
  heatmapRisks?: HeatmapRiskInput[],
  focusRiskIds?: string[],
  stakeholderCategories?: string[]
): string {
  return `
## RISK ANALYSIS
Organize identified risks from these perspectives:
- Risk content and occurrence mechanism (only those documented)
- Probability and impact (only if documented)
- Implemented/planned countermeasures
- Residual risks and acceptability

※ Estimation of probability/impact and fabrication of causal analysis are prohibited per Anti-Hallucination Rules (Section 2).

### Risk Heatmap (risk-heatmap block)
Output **exactly one** code block of the following form in the whole report. The system renders it as a 5×5 heatmap
and highlights the risks mentioned in the body of this report.

\`\`\`risk-heatmap
{"title":"Figure X: Risk Heatmap","risks":[{"id":"R-101","name":"Risk name","likelihood":"Medium","impact":"High","status":"Mitigation in progress"}]}
\`\`\`

- \`risks\` must list **every risk documented in the provided documents**, including risks this report does not discuss (stakeholder-specific filtering does NOT apply to this block)
- Placement: inside the section dealing with risks (Risk Assessment, Risk Summary, Detailed Risk Analysis, Residual Risk Evaluation, Technical Risks and Countermeasures, etc.); if there is no such section, at the end of the report
- The language tag must be \`risk-heatmap\`, and the content must be valid JSON only (no comments, no trailing commas)
- Copy \`likelihood\` and \`impact\` exactly as documented (High/Medium/Low, or a number 1-5)
- Use \`null\` when not documented (estimation or filling-in is prohibited)
- \`id\`, \`name\` and \`status\` must also come from the documents
- Add a one-line explanation right after the block, e.g. "* This figure places all documented risks on a matrix of impact (vertical) and likelihood (horizontal), highlighting those covered in this report."
- Do not output the block if no risks are documented

### Risk IDs (MANDATORY)
Whenever the body (including tables and lists) mentions an individual risk, always include its risk ID (e.g., R-101).
Heatmap highlighting is determined by the risk IDs appearing in the body.${generateFocusRiskPromptEN(heatmapRisks, focusRiskIds, stakeholderCategories)}`;
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

### STRUCTURE COMPLIANCE RULES (MANDATORY)
- **Create ONLY the sections listed above**
- Do NOT add any sections not listed above (e.g., Traceability Analysis, Glossary, References, etc.)
- Chapter numbers must strictly follow the numbering above
- Do NOT reorder the sections
- Exception: An "Appendix" may be added after the final chapter ONLY if supplementary information (e.g., abbreviation list, referenced documents list) would aid reader comprehension

### ADDITIONAL NOTES
- Include "Root Cause Analysis", "5 Whys Analysis" sections ONLY when documented analysis records exist in source materials (see Anti-Hallucination Rules, Section 2)`;

  return prompt;
}

// ============================================================================
// 13b. GSN node heatmap
// ============================================================================

/**
 * Instructions for the GSN nodes the user selected to detail, based on their relevance to the stakeholder
 * (empty string when nothing is specified)
 */
function generateFocusGsnNodePromptEN(
  heatmapGsnNodes: HeatmapGsnNodeInput[] | undefined,
  focusGsnNodes: FocusGsnNodeInput[] | undefined,
  stakeholder?: Stakeholder
): string {
  if (!heatmapGsnNodes || !focusGsnNodes || focusGsnNodes.length === 0) return '';

  const byId = new Map(heatmapGsnNodes.map((n) => [n.id, n]));
  const focusIds = new Set(focusGsnNodes.map((f) => f.id));
  const othersCount = heatmapGsnNodes.filter((n) => !focusIds.has(n.id)).length;
  const fmt = (v?: string | null) => (v ? v : 'Not documented');
  const role = stakeholder?.role ?? 'the reader';

  const lines = focusGsnNodes.map((f) => {
    const node = byId.get(f.id);
    const category = f.categories.length > 0 ? f.categories.join(', ') : '(none specified)';
    return `- ${f.id}${node?.text ? `: ${node.text}` : ''} (Status: ${fmt(node?.status)} / Severity: ${fmt(node?.severity)} / Categories: ${category}${f.reason ? ` — ${f.reason}` : ''})`;
  });

  return `

### GSN Nodes to Detail in This Report (user-specified, by relevance to the reader)
※ This is NOT a section definition. Do not add a new chapter or section to the report structure; write about them inside existing ones.
On the GSN node heatmap, the user selected, based on relevance to ${role} (matches with the categories they need and the argument layers they focus on) and status, the nodes this report must describe in detail.
This specification takes precedence over stakeholder-specific information filtering, volume rules, and node limits in the GSN analysis (e.g. "main goals only").

**Nodes to detail (${focusGsnNodes.length})**: Address each node individually and always include its node ID. Within what is documented, describe:
1. Its status and the evidence supporting it (Solutions, referenced documents)
2. Related hazards/risks (with IDs) and their severity
3. Open issues and remaining work
4. What it means for ${role} from the viewpoint of the categories below (decisions, explanations, or actions needed)
${lines.join('\n')}

**Other nodes (${othersCount})**: Do not give them their own sections or detailed explanations; mention them only briefly within the summary of the overall argument status.

※ Per Anti-Hallucination Rules (Section 2), describe causes, impacts, and outlook only when documented. Otherwise state "[Requires investigation]".`;
}

/**
 * Instructions for the GSN node heatmap (gsn-heatmap block)
 * - Empty when there is no GSN file
 * - When heatmapGsnNodes (extracted on screen) is given, the model uses it as is
 * - The system computes relevance from stakeholderCategories / stakeholderLayers, so the model does not output relevance
 * ※ Uses ### only: a ## heading would compete with the GSN-derived outline as a second structure definition
 */
export function generateGsnHeatmapPromptEN(
  hasGSN: boolean,
  heatmapGsnNodes?: HeatmapGsnNodeInput[],
  focusGsnNodes?: FocusGsnNodeInput[],
  stakeholder?: Stakeholder,
  heatmapGsnStakeholderCategories?: string[],
  heatmapGsnStakeholderLayers?: string[]
): string {
  if (!hasGSN) return '';

  const role = stakeholder?.role ?? 'the reader';
  // The reader's needs (decided on screen -> table for predefined stakeholders -> otherwise the model decides)
  const preset = stakeholder ? STAKEHOLDER_PROFILE_MAP[stakeholder.id] : undefined;
  const stakeholderCategories =
    heatmapGsnStakeholderCategories && heatmapGsnStakeholderCategories.length > 0
      ? heatmapGsnStakeholderCategories
      : preset?.categories;
  const stakeholderLayers =
    heatmapGsnStakeholderLayers && heatmapGsnStakeholderLayers.length > 0
      ? heatmapGsnStakeholderLayers
      : preset?.layers;
  const categoryRule = `- Each node's \`categories\` lists the IDs of the following topic categories the node belongs to (multiple allowed). Include those explainable from the node's documented content and from facts documented in the provided documents about the hazards, requirements, or tests the node cites (failed tests, milestone delays, budget overruns, standard conformance, etc.). Do not guess undocumented impacts. Use \`[]\` if none
${formatCategoryDefinitions('en')}`;
  const concerns = (stakeholder?.concerns ?? []).join(', ') || 'none';
  const profileRules = [
    stakeholderCategories
      ? `- Set \`stakeholderCategories\` to ${JSON.stringify(stakeholderCategories)}`
      : `- \`stakeholderCategories\` lists the IDs of the categories above that ${role} needs, judging from their concerns (${concerns})`,
    stakeholderLayers
      ? `- Set \`stakeholderLayers\` to ${JSON.stringify(stakeholderLayers)}`
      : `- \`stakeholderLayers\` lists the IDs of the 1-2 argument layers below that ${role} mainly reads
${formatLayerDefinitions('en')}`,
  ];
  const profileJson = {
    ...(stakeholderCategories ? { stakeholderCategories } : {}),
    ...(stakeholderLayers ? { stakeholderLayers } : {}),
  };
  const missingProfileRules = profileRules.filter((_, i) => (i === 0 ? !stakeholderCategories : !stakeholderLayers));

  const dataRule =
    heatmapGsnNodes && heatmapGsnNodes.length > 0
      ? `- Use the following JSON (all nodes extracted from the documents) exactly as given (only adjust the figure number in title to match the document numbering).
\`\`\`gsn-heatmap
${JSON.stringify({ title: 'Figure X: GSN Node Heatmap', ...profileJson, nodes: heatmapGsnNodes })}
\`\`\`${missingProfileRules.length > 0 ? `\n${!stakeholderCategories ? `${categoryRule}\n` : ''}${missingProfileRules.join('\n')}` : ''}`
      : `- List **all** Goal / Strategy / Solution / Undeveloped nodes documented in the GSN file in \`nodes\` (exclude Context / Assumption / Justification; include nodes not discussed in the body)
- Copy \`status\` exactly as documented (Achieved/Partially achieved/Not achieved/Undeveloped, etc.). Use \`null\` if not documented
- \`parentIds\` lists the parent node IDs copied from the documents (parent node column, tree diagram). Use \`[]\` for the top goal and \`null\` if it cannot be read (no guessing)
- Determine \`severity\` in this order, copying the documented value as is (estimation or filling-in is prohibited):
  1. The severity / ASIL documented for the node itself
  2. Otherwise, the highest documented severity or impact of the hazards/risks (H-xxx, R-xxx, etc.) cited by the node's content or rationale
  3. Otherwise \`null\`
- \`severitySource\` states where severity came from (e.g. "H-101, H-103 (Serious)")
${categoryRule}
${profileRules.join('\n')}`;

  return `

### GSN Node Heatmap (gsn-heatmap block)
※ This is NOT a section definition. Do not add a new chapter or section to the report structure; place it inside an existing one.
Output **exactly one** code block of the following form in the entire report. The system renders it as a "relevance to ${role} (vertical: Required/Related/Reference) × status (horizontal)" heatmap.
The system computes relevance from how well each node matches the categories ${role} needs (\`stakeholderCategories\`) and the argument layers they focus on (\`stakeholderLayers\`); do not write relevance in the JSON.

\`\`\`gsn-heatmap
{"title":"Figure X: GSN Node Heatmap","stakeholderCategories":["hazard-risk","business"],"stakeholderLayers":["top","subgoal"],"nodes":[{"id":"G1.2","type":"Sub-Goal","text":"Documented node statement","status":"Partially achieved","severity":"Serious","severitySource":"H-101, H-103 (Serious)","parentIds":["S1"],"categories":["hazard-risk","verification"]}]}
\`\`\`

- Placement: inside the chapter covering GSN analysis / argument status. If there is no such chapter, at the end of the report
- The language tag must be \`gsn-heatmap\`, and the content must be valid JSON only (no comments, no trailing commas)
${dataRule}
- Right after the block, add a one-line note such as "* This figure places the GSN nodes on a matrix of relevance to ${role} (vertical) and status (horizontal); color shows priority (darker for more relevant, unresolved nodes)."

### GSN Node IDs (required)
Whenever the body (including tables and bullet lists) refers to an individual GSN node, always include its node ID (e.g. G1.2, Sn3).
When you refer to the content of evidence (test results, records, evaluation results, etc.), also include the ID of that evidence node (e.g. "TR-101 failed (evidence Sn4: Verification results summary)").
Heatmap highlighting is determined by the node IDs appearing in the body (symbol explanations in the reading guide or glossary do not count).${generateFocusGsnNodePromptEN(heatmapGsnNodes, focusGsnNodes, stakeholder)}`;
}

// ============================================================================
// 13c. Overall verdict (computed by the system)
// ============================================================================

/**
 * Instructions for the overall verdict. The system computes it from GSN nodes and risks by rule so it is shared by all stakeholders
 * (empty string when absent = the LLM judges from the documents as before)
 */
export function generateSafetyVerdictPromptEN(safetyVerdict?: SafetyVerdictInput): string {
  if (!safetyVerdict) return '';
  const reasons = safetyVerdict.reasons.length > 0 ? safetyVerdict.reasons.map((r) => `- ${r}`).join('\n') : '- None (no rule applies)';
  return `

### Overall Verdict (computed by the system, fixed)
* This is not a section definition. Use it where the existing structure states the overall verdict (safety status determination), such as the executive summary.
The overall verdict of this report was computed by the system by applying the following rules to the GSN nodes and risks extracted from the documents, and is the same for the reports for every stakeholder.

**Overall verdict: ${safetyVerdict.label}**

Rules:
${safetyVerdict.rules.map((r) => `- ${r}`).join('\n')}

Items that led to this verdict:
${reasons}

- Write the overall verdict exactly as above (color and label). Do not upgrade or downgrade it, or replace it with another color or wording (e.g. "acceptable with conditions", "caution")
- Include every item above, with its ID, in the basis for the verdict. Only the order, supplementary explanation, and what it means for the reader may be adapted to the reader
- If the documents state a different status (e.g. quality status), present it separately as "the documented XX status" and do not confuse it with the overall verdict`;
}

// ============================================================================
// 14. Build Complete User Prompt (v5 Update)
// ============================================================================

export function buildCompleteUserPromptEN(params: {
  stakeholder: Stakeholder;
  strategy: RhetoricStrategy;
  contextContent: string;
  reportSections: string[];
  hasGSN: boolean;
  structureDescription?: string;
  heatmapRisks?: HeatmapRiskInput[];
  focusRiskIds?: string[];
  heatmapRiskStakeholderCategories?: string[];
  heatmapGsnNodes?: HeatmapGsnNodeInput[];
  focusGsnNodes?: FocusGsnNodeInput[];
  heatmapGsnStakeholderCategories?: string[];
  heatmapGsnStakeholderLayers?: string[];
  safetyVerdict?: SafetyVerdictInput;
}): string {
  const { stakeholder, strategy, contextContent, reportSections, hasGSN, structureDescription, heatmapRisks, focusRiskIds, heatmapRiskStakeholderCategories, heatmapGsnNodes, focusGsnNodes, heatmapGsnStakeholderCategories, heatmapGsnStakeholderLayers, safetyVerdict } = params;

  // Prompt assembly order (by importance — no duplicates)
  const parts = [
    // 1. Role definition
    generateSystemPromptEN(),
    
    // 2. Anti-hallucination + fidelity/consistency (single authoritative source)
    generateAntiHallucinationPromptEN(stakeholder),
    
    // 3. Output constraints (format, style, volume)
    generateOutputConstraintsEN(stakeholder),
    
    // 4. Redundancy prevention + information density optimization
    generateRedundancyPreventionPromptEN(stakeholder),
    
    // 5. Document usage principles (citation rules, comprehensiveness, quantification merged)
    generateDocumentUsagePrinciplesEN(),
    
    // 6. Stakeholder-specific settings
    generateStakeholderSectionEN(stakeholder, strategy),
    
    // 7. Report guidelines + terms/plain language (merged)
    generateReportGuidelinesEN(stakeholder),
    
    // 8. Content generation guides
    generateGSNAnalysisPromptEN(hasGSN, stakeholder),
    generateFigureRequirementsPromptEN(hasGSN, stakeholder),
    generateRiskAnalysisPromptEN(heatmapRisks, focusRiskIds, heatmapRiskStakeholderCategories),
    generateGsnHeatmapPromptEN(hasGSN, heatmapGsnNodes, focusGsnNodes, stakeholder, heatmapGsnStakeholderCategories, heatmapGsnStakeholderLayers),
    generateSafetyVerdictPromptEN(safetyVerdict),
    
    // 9. Invalid file handling (reference)
    generateInvalidFileGuidelinesEN(),
    
    // 10. Rhetoric strategy
    `\n※ Apply the following strategy while complying with Anti-Hallucination Rules (Section 2).
${strategy} characteristics:${getStrategyGuidelinesEN(strategy)}`,
    
    // 11. Provided documents
    `\n## PROVIDED DOCUMENT CONTENT\n${contextContent}`,
    
    // 12. Structure instruction
    generateStructurePromptEN(reportSections, hasGSN, stakeholder, structureDescription)
  ];

  return parts.join('\n');
}