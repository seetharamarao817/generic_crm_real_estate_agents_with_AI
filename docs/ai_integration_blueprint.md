# 🧠 AI-Native CRM Integration Blueprint

This document outlines the high-scale execution plan for integrating Generative AI and Predictive Analytics into the Generic CRM architecture.

## 1. Lead Intelligence Layer (The "Scout")
**Goal:** Automate lead qualification and prioritization to maximize agent efficiency.

### A. Dynamic Lead Scoring (P2P - Propensity to Purchase)
- **Integration Point:** `LeadsView` & `Dashboard`
- **Logic:** An LLM analyzes the `property_preferences` JSON and the `LeadRequest` conversation transcript.
- **Output:** A score (0-100) and a "Logic Summary" (e.g., *"Score 85: Highly active seeker, budget matches project 'Indigo', timeline within 30 days."*).
- **Backend:** `POST /crm/leads/{id}/analyze`

### B. Automated Lead Enrichment
- **Integration Point:** `Public Lead Intake`
- **Logic:** When a lead is captured from a tracking URL, the AI uses the email/phone to find public professional data (LinkedIn snippets, company size).
- **Output:** Auto-filling the `company` and `notes` fields before the agent even sees the lead.

---

## 2. Communication Intelligence (The "Scribe")
**Goal:** Reduce response latency and improve "Human-in-the-loop" coordination.

### A. Smart Thread Summarization
- **Integration Point:** `LeadsView` Drawer (Inquiry Thread)
- **Logic:** Convert long message histories into a 3-bullet "Context Snapshot."
- **Benefit:** Allows agents to catch up on complex lead requirements in 5 seconds.

### B. Approval-Based SMS/Email Drafting
- **Integration Point:** `ApprovalsInbox`
- **Logic:** Based on a lead's question (e.g., "Is there a gym?"), the AI drafts a response drawing from the `Product` (Campaign) description.
- **Benefit:** High speed with human oversight.

---

## 3. Product & Campaign Intelligence (The "Co-Pilot")
**Goal:** Transform static project data into high-converting marketing assets.

### A. Campaign Creative Generator
- **Integration Point:** `ProductsView` (Step 3 of Wizard)
- **Logic:** Use `property_details` (bedrooms, area, location) to generate:
  - Personalized SMS Blurbs
  - Professional Email Body
  - Social Media Ad Copy
- **Output:** Multi-variant copy ready for the agent to review and send.

### B. Semantic Lead-to-Project Matching
- **Integration Point:** `ProductsView` Detail Page
- **Logic:** Semantic search mapping project features against the entire Lead database.
- **Output:** A list of "Perfect Matches" to target for this specific project launch.

---

## 4. Operational Intelligence (The "Analyst")
**Goal:** Predictive forecasting for the team.

### A. Meeting Briefing Service
- **Integration Point:** `Meeting Scheduler`
- **Logic:** Sends an internal briefing to the agent 1 hour before a meeting.
- **Content:** Recap of last discussion, lead's sensitive points (budget/location), and "Suggested Closing Angle."

### B. Pipeline Risk Detection
- **Integration Point:** `DealsKanbanView`
- **Logic:** Detects deals that have stalled or where lead sentiment has turned "Cold" based on communication frequency.

---

## 🛠️ Technical Stack for AI
- **LLM Orchestration:** OpenRouter (GPT-4o for complex logic, Llama 3 for fast summaries).
- **Observability:** Langfuse (already configured in `.env`).
- **Storage:** Vector embeddings in PostgreSQL via `pgvector` for lead-project matching.
