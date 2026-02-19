# Facemelter CRM Deep AI Integration Plan

## Objective
- After a new lead is created from X/LinkedIn/manual entry, run deeper AI research to enrich the lead with real, source-backed facts.
- Use GPT + Playwright as an agent loop that can search, open pages, extract structured facts, and decide next steps.
- After enrichment is complete, generate first-contact recommendations and drafts using StableGen-specific outreach strategy.

## Scope (Next Step)
In scope:
- Agentic lead enrichment using OpenAI Responses API + Playwright tools.
- Source-backed profile enrichment (no invented facts).
- First-contact strategy + message draft generation.

Out of scope (for this phase):
- Full autonomous sending.
- Multi-user approval workflows.
- Cross-lead campaign orchestration.

## Definition Of Done
Research for a lead is marked `done` when one of these is true:
1. Required facts are collected with evidence.
2. Search/tool budget is exhausted.
3. The model determines no more useful public information is available.

Required facts target:
- Canonical profile URL (X, LinkedIn, website, or portfolio).
- At least one valid handle or direct contact path.
- Best-effort role/persona summary.
- 3 to 6 evidence-backed facts relevant to StableGen fit.
- 1 to 3 recommended outreach angles tied to evidence.

Required quality rule:
- Every stored fact must include `source_url` and `evidence_snippet`.
- No evidence means no fact saved.

## Architecture

### 1) Provider Layer
- Keep both providers:
- `OllamaClient` for fast/cheap scoring and batch tasks.
- `OpenAI` for deep research and message generation.
- Add selector: `AiProviderConfig` with modes:
- `auto` (default): OpenAI for deep research/drafts, Ollama for baseline scoring.
- `openai`: force OpenAI.
- `ollama`: force Ollama.

### 2) Agent Orchestrator
- New service: `LeadResearchOrchestrator`.
- Runs a step loop:
1. Build context pack from lead + signals + communications.
2. Ask GPT for next tool action.
3. Execute tool.
4. Feed result back.
5. Repeat until `done` or budget reached.
- Enforce hard limits:
- max steps: 12
- max tool calls: 20
- max run time: 4 minutes

### 3) Tool Gateway (Playwright)
- New wrapper service + Node script bridge:
- `PlaywrightToolGateway` -> `script/research_tools.js`
- Initial tool set:
- `web_search(query, limit)` using browser search page.
- `open_page(url)`
- `extract_profile_fields()` with deterministic selectors + fallback heuristics.
- `extract_links()` for outbound social/website discovery.
- `extract_recent_posts(limit)` for context clues.
- `take_note(fact_type, value, source_url, evidence_snippet, confidence)` (server-validated save).

### 4) Storage
- New table: `lead_research_runs`
- `lead_id`, `status`, `provider`, `model`, `started_at`, `finished_at`, `step_count`, `done_reason`, `error_message`, `raw_usage_json`.
- New table: `lead_research_findings`
- `lead_id`, `run_id`, `fact_type`, `value_text`, `confidence`, `source_url`, `evidence_snippet`, `metadata`.
- Optional table (phase 2): `lead_outreach_drafts`
- `lead_id`, `run_id`, `method`, `channel`, `subject`, `body`, `rationale`, `status`.

## Context Given To GPT
Each step request should include:
- Lead fields: name, platform, handle, role, notes, category, score, status.
- Existing signals (latest first) and source links.
- Existing communications (what already happened).
- Findings collected so far.
- Fact checklist (what is still missing).
- Hard guardrails:
- Do not invent facts.
- Save only facts with citations.
- Prefer official profiles + creator-owned websites first.
- Skip paywalled/private data.

## Outreach Context Contract
Use a structured context payload when generating outreach drafts:
- Business goal:
- Find and start conversations with AI filmmakers and creators likely to use StableGen.
- StableGen positioning:
- End-to-end AI film pre-production pipeline: script, scene refinement, shot list, assets, prompts/multi-prompts.
- Supports shorts, commercials, documentaries, micro dramas, web series, nanodramas, music videos.
- Voice mix:
- 80% Patrick builder voice, 20% more confident.
- Tone rules:
- Short, clear, direct sentences.
- No fluff, no corporate language, no hype words, no emoji by default, no em dash.
- Offer terms:
- 100 free tokens, no credit card required, white-glove help, optional quick intro call.
- Outreach philosophy:
- Workflow discovery first, then map StableGen to specific workflow friction.
- Method set:
- `PC`, `PEC`, `PPC`, `SMYKM` for first message generation.
- If method is missing, return `needs_method` and ask before generating.
- Non-negotiables:
- No verbatim quotes from transcripts.
- No imitation of real people’s exact phrasing.
- No fabricated lead facts.
- Never claim to have seen work unless evidence is present.

## Enrichment Workflow
1. New lead is created (or manual “Run deep research”).
2. Queue `LeadDeepResearchJob`.
3. Orchestrator runs agent loop and writes findings incrementally.
4. Lead is updated with normalized fields when confidence threshold is met.
5. Re-run qualification score with enriched context.
6. Mark run `done` with summary and done reason.

## Outreach Draft Workflow
1. User clicks `Generate first contact`.
2. UI requires method selection: `PC`, `PEC`, `PPC`, `SMYKM`.
3. Queue `LeadOutreachDraftJob`.
4. GPT receives:
- Enriched findings + citations.
- StableGen positioning + voice constraints.
- Method-specific instructions.
5. Save output drafts for:
- connection request text
- first DM
- follow-up DM
- email version
- optional comment starter

Rule:
- If method is not provided, return `needs_method` and do not draft.
- Every personalization claim must be traceable to a stored finding with source URL.

## Prompt Pack (System Rules)
Store prompts in files so they are versioned and testable:
- `config/prompts/research_system.md`
- `config/prompts/outreach_system.md`
- `config/prompts/outreach_method_pc.md`
- `config/prompts/outreach_method_pec.md`
- `config/prompts/outreach_method_ppc.md`
- `config/prompts/outreach_method_smykm.md`

Base non-negotiables:
- No verbatim transcript quoting.
- No imitation of real individuals.
- No fabricated claims.
- No pretending to have seen work if not evidenced.
- Short, direct language.

## UI Changes
- Lead detail section:
- `Run deep research` button.
- Research run status badge (`queued/running/done/failed`).
- Findings panel with source links.
- `Generate first contact` with required method dropdown.
- Draft panel with copyable blocks.

## Risk Controls
- Compliance:
- Keep scraping to public pages or user-authenticated browser profiles.
- Respect robots/TOS boundaries where applicable.
- Reliability:
- Save incremental progress every step.
- Resume failed runs from last step where possible.
- Cost:
- Per-run token and tool-call budget caps.
- Data quality:
- Citation-required persistence rule.

## Rollout Plan

### Phase 1 (Buildable in this repo now)
- Add `lead_research_runs` + `lead_research_findings`.
- Add `LeadDeepResearchJob` skeleton.
- Add deterministic tool gateway + one search flow.
- Add UI status + findings list (read-only).

### Phase 2
- Add full GPT tool loop (successive request/response).
- Add normalization rules to write high-confidence fields to `Lead`.
- Add auto-requalify after enrichment.

### Phase 3
- Add outreach draft job + method-specific templates.
- Add draft review UI and copy actions.
- Add outcome tracking loop from communications.

## Immediate Next Tasks
1. Create migrations for `lead_research_runs` and `lead_research_findings`.
2. Add `Lead#research_runs` and `Lead#research_findings` associations.
3. Implement `LeadDeepResearchJob` + `LeadResearchOrchestrator` (no UI yet).
4. Add `PlaywrightToolGateway` and `script/research_tools.js` with `web_search` + `open_page` + `extract_links`.
5. Add API endpoints to start a run and fetch run status/findings.
6. Add Lead UI buttons for `Run deep research` and findings panel.
