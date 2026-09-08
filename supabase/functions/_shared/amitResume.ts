/**
 * Amit Sengupta's resume, embedded verbatim as ground truth for job-match
 * evaluation. Source: Downloads/Amit-Sengupta-Resume.pdf. Update this
 * constant whenever the resume file changes -- there is no runtime PDF
 * parse, on purpose, so the match engine never runs against a stale or
 * mis-parsed read.
 */
export const AMIT_RESUME_TEXT = `
AMIT SENGUPTA
AI Evaluation & Enterprise Domain Expertise
Runs LLMs in production · 11 years inside enterprise operations · 10 years building the systems
India (UTC+5:30) · Delhi · Available 8am-1pm ET daily · $85/hour
fmamit@gmail.com · +91 77389 19680 · linkedin.com/in/amitsengupta29

PROFILE
I evaluate and deploy LLM output in production, in a domain most annotators have never worked in. 14 multi-tenant business
applications run live on my AI stack — lending, staffing, government and professional services operations — where a wrong extraction
has a financial consequence and every output has to be checkable against a source document.
Before building, 11 years inside enterprise operations on the buyer's side, at up to 24,000 users and $25M of managed budget. I know
what correct looks like in credit decisioning, incentive computation, applicant tracking, accounts payable and field operations, because
I ran those processes before I automated them.

MODEL EVALUATION & JUDGMENT
- Operate a multi-model routing layer with task-based fallbacks in production — Claude, GPT-OSS on Groq and Cerebras, Gemini.
  Routing decisions are made on measured task fit: reasoning depth against latency against cost, re-tested when models change
- Define ground truth for document extraction across invoices, estimates, expense claims, payment proofs, KYC documents, bank
  statements and ITRs — specifying what a correct parse is, and what counts as a failure worth flagging
- Ground model output against source data so it cannot hallucinate outside the business context — retrieval scoped to the client's
  own records, answers traceable to the document they came from, and refusal preferred over a plausible guess
- Built fraud and consistency evaluation at the decision point: bureau history, including foreclosed and settled loans, reconciled
  against borrower-submitted returns and statements. Every judgment traceable to a source document
- Apply a hard deployment test — where output cannot be checked, AI does not ship. Pulled an AI outbound calling pilot after 54 calls
  on that basis, despite it working technically
- Built an autonomous health sentinel that runs end-to-end functional tests across every platform daily and detects silent output
  failure, which is the failure mode LLM features actually have. Support tickets fell from ~85/month to 2
- Ran a large negative result and reported it honestly: an autonomous marketing engine across ~200k emails, 100k WhatsApp
  messages and 74k calls produced 2 outcomes. Diagnosis — learning machinery applied to a task with no usable feedback signal.
  Shut down, redesigned around channels that generate signal

DOMAIN DEPTH FOR EXPERT DATA
Areas where I can generate, review and grade expert-level material rather than annotate generically:
- Lending operations — loan origination end to end: lead capture, KYC and video KYC, account aggregator, bureau and credit analysis,
  policy gating, disbursal, e-agreements, collections. ~500 loans disbursed and collected on a system I built
- Enterprise software buying — RFP, vendor evaluation, requirements gathering across functions, acceptance criteria, adoption.
  Owned end to end at HDFC Life, Canara HSBC and Ree Laboratories
- Business operations and finance workflow — accounts payable, incentive computation, revenue and DSO definition, governance, PII
  access control under India's DPDP regime
- Staffing and recruitment — applicant tracking at ~92,000 recruits across ~600 client accounts and ~2,500 sites
- CRM, workflow design and field operations, including offline-sync and concurrency behaviour in low-connectivity environments

SELECTED OUTCOMES
Redefine Marcom | Marketing & events services · 140 staff · 13 functional teams
A single CRM engagement expanded into the company's full operating platform over 9 months — finance, payroll, HR, sales, vendor
AP, governance. 11 live AI features.
- Revenue per head rose 44% while headcount grew 14%
- 100% adoption — 111 of 111 current staff active 9 months post go-live
- $423K in unclaimed vendor co-marketing funding surfaced by a report that had never existed
- ~1.9M PII records brought under access control and export gating

Capital India Finance Ltd | NSE/BSE-listed non-bank lender · ~$117M AUM
AI-triaged borrower service desk, wired into the client's own systems via two-way API. Since expanded to vendor management and
internal IT helpdesk.
- 6,215 service requests logged and auto-categorized, Oct 2025 to Jul 2026
- 76% arrive self-serve with zero manual entry; 82.4% closure rate
- 2 support tickets raised in 10 months of operation

Paisaasaarthi | Loan origination system, built end to end
- AI gating layer enabled a 3-hour decision-to-disbursement policy
- ~500 loans disbursed and collected end to end before the client wound down

IEDUP | Govt. of Uttar Pradesh, Dept. of MSME & Export Promotion
Course administration for World Bank-sponsored RAMP scheme certificate programmes. Expanding to an AI voicebot and a rebuilt
core training platform.

EXPERIENCE
Founder — Prosync AI Solutions (OPC) Pvt Ltd | 2026 – present
Founder — ECR Technical Innovations | 2019 – 2025
One continuous product line under two entities. In-Sync and its clients moved to Prosync in 2026 — same product line, same codebase, new entity.
Built and shipped In-Sync, a multi-tenant business software suite: CRM, ATS, event management, accounts payable, task and expense
management, WhatsApp and email broadcasting, field staff tracking, ticketing. 14 production applications live.
- Sold to 90+ organizations at ECR, including Motherson, InCred, Hiranandani, BSE Ebix, Quess Corp, Ezeepay and Zopper
- Ran a team of 24; took major initiatives through a board
- Rebuilt the entire product line personally after the outsourced delivery model failed to produce enterprise-grade systems; retention
  and solution fit both changed
- Every client held has since expanded scope beyond the original engagement, on their own request

General Manager, Sales (South & West India) — Ree Laboratories | 2011 – 2014
Life sciences / stem-cell services. Owned the Salesforce implementation end to end — requirements across functions, vendor
selection, delivery, adoption.

Senior Manager, Sales Strategy & Business Development — Canara HSBC OBC Life | 2008 – 2011
Owned MyChoiceRewards, a custom-built incentives and rewards platform deployed across the staff of three partner banks. RFP
through adoption.

Manager, Retail Strategy & Business Development — HDFC Life | 2003 – 2008
Owned the implementation of CSC's Bonus Workbench for incentive management — 24,000 sales staff across channels, approximately
$25M of incentive budget.

Earlier | Trgx / Arohan Training Solutions 2015-17 · Chrysil Technosyst Ventures 2014-15
SaaS corporate training platform; sales leadership in ed-tech.

Flight Lieutenant, Air Traffic Control — Indian Air Force | 1995 – 2001
Commissioned officer.

TECHNICAL
Prompt engineering · AI evaluation · Model comparison and routing · RAG · Grounding and hallucination mitigation · Document
intelligence · OCR · Natural language to SQL · Voice AI · Ground truth definition · Output validation
Claude · GPT-OSS · Groq · Cerebras · Gemini · ElevenLabs · Claude Code
Python · PostgreSQL · MySQL · REST APIs · Multi-tenant SaaS architecture · Workflow automation · Solution architecture
Enterprise implementation · Requirements gathering · Acceptance criteria · Stakeholder management · Vendor selection · RFP ·
Adoption

EDUCATION & OTHER
- PGDM, Finance & Marketing — Symbiosis Centre for Management & HRD (SCMHRD), Pune | 2001 – 2003
- B.Com — Bareilly College
- Founder Institute (Silicon Valley) — startup accelerator; one of 12 founders reaching pitch day from a starting cohort of ~400
`.trim();
