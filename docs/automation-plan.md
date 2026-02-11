# Facemelter CRM Automation Plan

## Goals
- Automate lead discovery, qualification, and outreach with minimal manual input.
- Turn signals from public sources into scored, prioritized leads.
- Keep the UI simple while the backend does most of the work.

## Phase 1: Lead Capture + Scoring (MVP automation)
1. Ingestion
- YouTube public search and channel pages.
- X (public pages or search where allowed).
- Web targets (filmmaker portfolios, festival sites, forums).

2. Normalization
- Convert raw items into `Lead` and `Signal` records.
- Deduplicate by email, handle, channel id, or normalized name.

3. Scoring
- Rules-based score using a transparent rubric.
- Example weights: subs, engagement, AI keywords, recency, platform priority.

4. Auto-tagging
- Tags like `ai_filmmaker`, `educator`, `festival`, `agency`, `partner`.

5. Dashboard metrics (real)
- Leads created per day.
- Signals captured per day.
- Channel mix by `platform` or `source`.

## Phase 2: Outreach Workflow
1. Task queue
- Next action, due date, owner.

2. Email drafting
- Draft outreach email based on lead profile + signals.
- Save drafts in CRM for manual review.

3. Follow-up automation
- Reminder system based on last contact date.

4. Activity timeline
- Record changes, outreach attempts, and signal captures.

## Phase 3: Intelligence + Learning
1. Feedback loop
- Capture win/loss reasons and influence on scoring.

2. Score tuning
- Improve scoring weights based on outcomes.

3. Campaign analytics
- Track which channels and messages convert best.

## Proposed Data Model Additions
- `Signal`: source, url, title, captured_at, metadata json.
- `LeadSignal`: join table for lead relevance.
- `LeadTask`: next_action, due_at, completed_at, owner_id.
- `LeadActivity`: event_type, payload json, occurred_at.
- `LeadTag`: name, lead_id.

## System Architecture
- Background job runner for ingestion and scoring.
- Scheduled jobs per source (daily or hourly).
- Rate limiting and polite crawling for public sources.
- Scoring pipeline triggered on new signals or lead updates.

## Initial Build Order
1. Create `Signal` and `LeadActivity` models.
2. Add background job framework and a scheduled job runner.
3. Implement one source end-to-end (YouTube public).
4. Build scoring rules + update lead score.
5. Wire dashboard charts to real data.

## Open Decisions
- Job runner choice and scheduling strategy.
- Exact scoring rubric and thresholds.
- First external source to implement.

