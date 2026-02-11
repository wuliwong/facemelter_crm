import React, { useEffect, useMemo, useRef, useState } from "react"
import { apiRequest } from "./api"

const STATUS_OPTIONS = [
  "new",
  "needs_review",
  "contacted",
  "interested",
  "onboarding",
  "active",
  "closed"
]

const EMPTY_FORM = {
  name: "",
  platform: "",
  handle: "",
  email: "",
  status: "new",
  score: "",
  source: "",
  role: "",
  country: "",
  notes: ""
}

const EDITABLE_LEAD_FIELDS = [
  "name",
  "platform",
  "handle",
  "email",
  "status",
  "score",
  "source",
  "role",
  "country",
  "notes"
]

const buildLeadPayload = (source) => {
  const payload = {}
  EDITABLE_LEAD_FIELDS.forEach((field) => {
    payload[field] = source[field]
  })

  if (payload.score === "") {
    delete payload.score
  }

  return payload
}

const formatConfidence = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return "—"
  return `${Math.round(num * 100)}%`
}

const formatTimestamp = (value) => {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString()
}

const normalizeHandle = (value) => (value || "").toString().trim()

const handleToUrl = (lead) => {
  const handle = normalizeHandle(lead?.handle)
  if (!handle) return null

  if (/^https?:\/\//i.test(handle)) return handle

  const cleaned = handle.replace(/^@/, "")
  const platform = (lead?.platform || "").toString().toLowerCase()

  if (platform.includes("x") || platform.includes("twitter")) {
    return `https://x.com/${cleaned}`
  }
  if (platform.includes("youtube")) {
    return cleaned.startsWith("@")
      ? `https://www.youtube.com/${cleaned}`
      : `https://www.youtube.com/@${cleaned}`
  }
  if (platform.includes("instagram")) {
    return `https://www.instagram.com/${cleaned}`
  }
  if (platform.includes("tiktok")) {
    return `https://www.tiktok.com/@${cleaned}`
  }
  if (platform.includes("reddit")) {
    return `https://www.reddit.com/user/${cleaned}`
  }
  if (platform.includes("linkedin")) {
    return `https://www.linkedin.com/in/${cleaned}`
  }
  if (platform.includes("facebook")) {
    return `https://www.facebook.com/${cleaned}`
  }
  if (platform.includes("web") || platform.includes("site")) {
    return /^www\./i.test(cleaned) ? `https://${cleaned}` : `https://${cleaned}`
  }

  if (cleaned.includes(".") && !cleaned.includes(" ")) {
    return /^www\./i.test(cleaned) ? `https://${cleaned}` : `https://${cleaned}`
  }

  return null
}

export default function LeadsView({ searchTerm = "" }) {
  const [leads, setLeads] = useState([])
  const [selectedLeadId, setSelectedLeadId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [editSaving, setEditSaving] = useState(false)
  const [inlineEdits, setInlineEdits] = useState({})
  const [inlineSaving, setInlineSaving] = useState({})
  const [xQuery, setXQuery] = useState("")
  const [xLoading, setXLoading] = useState(false)
  const [xMessage, setXMessage] = useState("")
  const [aiRescoring, setAiRescoring] = useState({})
  const [aiMessages, setAiMessages] = useState({})
  const rescoreTimersRef = useRef({})
  const xSearchPollTimerRef = useRef(null)
  const ollamaModel =
    typeof document !== "undefined"
      ? document.querySelector('meta[name="ollama-model"]')?.content || ""
      : ""

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredLeads = useMemo(() => {
    if (!normalizedSearch) return leads
    return leads.filter((lead) => (lead.name || "").toLowerCase().includes(normalizedSearch))
  }, [leads, normalizedSearch])

  const statsSource = normalizedSearch ? filteredLeads : leads
  const totalLeads = statsSource.length
  const whiteGlove = statsSource.filter((lead) => (lead.score || 0) >= 6).length
  const contacted = statsSource.filter((lead) => lead.status === "contacted").length

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId),
    [leads, selectedLeadId]
  )

  useEffect(() => {
    if (!selectedLeadId) return
    if (filteredLeads.some((lead) => lead.id === selectedLeadId)) return
    setSelectedLeadId(null)
    setEditMode(false)
  }, [filteredLeads, selectedLeadId])

  const fetchLeads = async (options = {}) => {
    const { keepSelection = false } = options
    const data = await apiRequest("/api/leads")
    const nextLeads = data.leads || []
    setLeads(nextLeads)

    if (keepSelection && selectedLeadId) {
      const existing = nextLeads.find((lead) => lead.id === selectedLeadId)
      if (existing) {
        hydrateEditForm(existing)
        return nextLeads
      }
    }

    setSelectedLeadId(null)
    setEditMode(false)
    return nextLeads
  }

  useEffect(() => {
    let mounted = true
    fetchLeads()
      .catch((err) => {
        if (!mounted) return
        setError(err)
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    return () => {
      Object.values(rescoreTimersRef.current).forEach(clearTimeout)
      rescoreTimersRef.current = {}
      if (xSearchPollTimerRef.current) {
        clearTimeout(xSearchPollTimerRef.current)
        xSearchPollTimerRef.current = null
      }
    }
  }, [])

  const hydrateEditForm = (lead) => {
    setEditForm({
      ...EMPTY_FORM,
      ...lead,
      score: lead.score ?? ""
    })
  }

  const handleFormChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleEditChange = (event) => {
    const { name, value } = event.target
    setEditForm((prev) => ({ ...prev, [name]: value }))
  }

  const startInlineEdit = (lead) => {
    setInlineEdits((prev) => ({
      ...prev,
      [lead.id]: {
        status: lead.status || "new",
        score: lead.score ?? ""
      }
    }))
  }

  const handleInlineChange = (leadId, field, value) => {
    setInlineEdits((prev) => ({
      ...prev,
      [leadId]: {
        ...prev[leadId],
        [field]: value
      }
    }))
  }

  const handleCreateLead = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const payload = buildLeadPayload(form)
      const data = await apiRequest("/api/leads", {
        method: "POST",
        body: { lead: payload }
      })
      setLeads((prev) => [data.lead, ...prev])
      setSelectedLeadId(data.lead.id)
      setForm(EMPTY_FORM)
      setShowForm(false)
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateLead = async (event) => {
    event.preventDefault()
    if (!selectedLeadId) return
    setEditSaving(true)
    setError(null)

    try {
      const payload = buildLeadPayload(editForm)
      const data = await apiRequest(`/api/leads/${selectedLeadId}`, {
        method: "PATCH",
        body: { lead: payload }
      })
      setLeads((prev) => prev.map((lead) => (lead.id === data.lead.id ? data.lead : lead)))
      setEditMode(false)
      hydrateEditForm(data.lead)
    } catch (err) {
      setError(err)
    } finally {
      setEditSaving(false)
    }
  }

  const handleInlineSave = async (leadId) => {
    const payload = inlineEdits[leadId]
    if (!payload) return
    setInlineSaving((prev) => ({ ...prev, [leadId]: true }))
    setError(null)

    try {
      const cleanPayload = { ...payload }
      if (cleanPayload.score === "") {
        delete cleanPayload.score
      }
      const data = await apiRequest(`/api/leads/${leadId}`, {
        method: "PATCH",
        body: { lead: cleanPayload }
      })
      setLeads((prev) => prev.map((lead) => (lead.id === data.lead.id ? data.lead : lead)))
      setInlineEdits((prev) => {
        const next = { ...prev }
        delete next[leadId]
        return next
      })
      if (selectedLeadId === leadId) {
        hydrateEditForm(data.lead)
      }
    } catch (err) {
      setError(err)
    } finally {
      setInlineSaving((prev) => ({ ...prev, [leadId]: false }))
    }
  }

  const handleInlineCancel = (leadId) => {
    setInlineEdits((prev) => {
      const next = { ...prev }
      delete next[leadId]
      return next
    })
  }

  const handleQuickStatusChange = async (leadId, newStatus) => {
    try {
      const data = await apiRequest(`/api/leads/${leadId}`, {
        method: "PATCH",
        body: { lead: { status: newStatus } }
      })
      setLeads((prev) => prev.map((lead) => (lead.id === data.lead.id ? data.lead : lead)))
      if (selectedLeadId === leadId) {
        hydrateEditForm(data.lead)
      }
    } catch (err) {
      setError(err)
    }
  }

  const pollLeadsAfterXSearch = (knownLeadIds, initialSize, attemptsLeft) => {
    if (attemptsLeft <= 0) {
      setXMessage((prev) =>
        prev.includes("new lead")
          ? prev
          : "X search queued. Waiting for results. If jobs are still running, they will keep appearing."
      )
      xSearchPollTimerRef.current = null
      return
    }

    xSearchPollTimerRef.current = setTimeout(async () => {
      try {
        const nextLeads = await fetchLeads({ keepSelection: true })
        nextLeads.forEach((lead) => knownLeadIds.add(lead.id))
        const totalNew = knownLeadIds.size - initialSize

        if (totalNew > 0) {
          setXMessage(
            `X search running. ${totalNew} new lead${totalNew === 1 ? "" : "s"} added.`
          )
        } else {
          setXMessage("X search queued. Waiting for new leads…")
        }
      } catch (_err) {
        // transient fetch errors should not break the polling loop
      }

      pollLeadsAfterXSearch(knownLeadIds, initialSize, attemptsLeft - 1)
    }, 4000)
  }

  const handleXSearch = async (event) => {
    event.preventDefault()
    const query = xQuery.trim()
    if (!query) return

    setXLoading(true)
    setXMessage("")
    setError(null)

    try {
      await apiRequest("/api/x/search", {
        method: "POST",
        body: { query, limit: 25 }
      })
      if (xSearchPollTimerRef.current) {
        clearTimeout(xSearchPollTimerRef.current)
        xSearchPollTimerRef.current = null
      }

      const knownLeadIds = new Set(leads.map((lead) => lead.id))
      const initialSize = knownLeadIds.size
      setXMessage("X search queued. Watching for incoming leads…")
      pollLeadsAfterXSearch(knownLeadIds, initialSize, 30)
      setXQuery("")
    } catch (err) {
      setError(err)
      setXMessage("Could not queue X search. Check your query and try again.")
    } finally {
      setXLoading(false)
    }
  }

  const handleDeleteLead = async (leadId) => {
    if (!confirm("Delete this lead?")) return

    try {
      await apiRequest(`/api/leads/${leadId}`, { method: "DELETE" })
      setLeads((prev) => prev.filter((lead) => lead.id !== leadId))
      if (selectedLeadId === leadId) {
        setSelectedLeadId(null)
      }
    } catch (err) {
      setError(err)
    }
  }

  const refreshLead = async (leadId, previousScoreAt) => {
    const data = await apiRequest(`/api/leads/${leadId}`)
    const updated = data.lead
    setLeads((prev) => prev.map((lead) => (lead.id === leadId ? { ...lead, ...updated } : lead)))

    if (updated.ai_last_scored_at && updated.ai_last_scored_at !== previousScoreAt) {
      const msg = updated.ai_fit_score != null
        ? "AI score updated."
        : updated.ai_reason || "AI scoring finished."
      setAiMessages((prev) => ({ ...prev, [leadId]: msg }))
      return true
    }

    return false
  }

  const pollLeadForScore = (leadId, previousScoreAt, attemptsLeft) => {
    if (attemptsLeft <= 0) {
      setAiMessages((prev) => ({
        ...prev,
        [leadId]: "Timed out waiting for AI score. The job may still be running."
      }))
      setAiRescoring((prev) => ({ ...prev, [leadId]: false }))
      delete rescoreTimersRef.current[leadId]
      return
    }

    rescoreTimersRef.current[leadId] = setTimeout(async () => {
      try {
        const updated = await refreshLead(leadId, previousScoreAt)
        if (updated) {
          setAiRescoring((prev) => ({ ...prev, [leadId]: false }))
          delete rescoreTimersRef.current[leadId]
          return
        }
      } catch (err) {
        // Swallow transient errors and keep polling.
      }
      pollLeadForScore(leadId, previousScoreAt, attemptsLeft - 1)
    }, 5000)
  }

  const handleAiRescore = async (leadId) => {
    if (aiRescoring[leadId]) return
    setAiRescoring((prev) => ({ ...prev, [leadId]: true }))
    setAiMessages((prev) => ({ ...prev, [leadId]: "" }))
    setError(null)

    try {
      if (rescoreTimersRef.current[leadId]) {
        clearTimeout(rescoreTimersRef.current[leadId])
        delete rescoreTimersRef.current[leadId]
      }
      await apiRequest(`/api/leads/${leadId}/requalify`, { method: "POST" })
      setAiMessages((prev) => ({
        ...prev,
        [leadId]: "AI re-score queued. Watching for updates…"
      }))
      const previousScoreAt =
        leads.find((lead) => lead.id === leadId)?.ai_last_scored_at || null
      pollLeadForScore(leadId, previousScoreAt, 30)
    } catch (err) {
      setError(err)
      setAiMessages((prev) => ({
        ...prev,
        [leadId]: "Could not queue AI re-score. Check logs and try again."
      }))
      setAiRescoring((prev) => ({ ...prev, [leadId]: false }))
    }
  }

  const activeAiMessages = Object.entries(aiMessages).filter(([, msg]) => msg)

  return (
    <div className="leads-page">
      {activeAiMessages.length > 0 && (
        <div className="flash-stack" role="status" aria-live="polite">
          {activeAiMessages.map(([leadId, message]) => {
            const lead = leads.find((l) => l.id === Number(leadId))
            const name = lead?.name || "Lead"
            const scoring = aiRescoring[leadId]
            const type = message === "AI score updated."
              ? "success"
              : scoring
              ? "info"
              : "alert"
            return (
              <div key={leadId} className={`flash ${type}`}>
                <span>
                  <strong>{name}:</strong> {message}
                </span>
                {!scoring && (
                  <button
                    className="flash-dismiss"
                    type="button"
                    aria-label="Dismiss"
                    onClick={() =>
                      setAiMessages((prev) => {
                        const next = { ...prev }
                        delete next[leadId]
                        return next
                      })
                    }
                  >
                    &times;
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <section className="panel">
        <div className="stats-grid">
          <div className="stat-card">
            <span className="label">Total leads</span>
            <strong className="stat-value">{totalLeads}</strong>
          </div>
          <div className="stat-card">
            <span className="label">White‑glove tier</span>
            <strong className="stat-value">{whiteGlove}</strong>
          </div>
          <div className="stat-card">
            <span className="label">Contacted</span>
            <strong className="stat-value">{contacted}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Lead Queue</h2>
            <p className="muted">Prioritize the next 10 white‑glove candidates.</p>
          </div>
          <div className="panel-actions">
            <form className="inline-search" onSubmit={handleXSearch}>
              <input
                value={xQuery}
                onChange={(event) => setXQuery(event.target.value)}
                placeholder="Search X (e.g. ai short film)"
                aria-label="Search X"
              />
              <button className="btn btn-sm" type="submit" disabled={xLoading}>
                {xLoading ? "Queuing…" : "Run X search"}
              </button>
            </form>
            {ollamaModel && (
              <span className="pill ai-model" title="Local qualification model">
                Model: {ollamaModel}
              </span>
            )}
            <button className="btn" onClick={() => setShowForm((prev) => !prev)}>
              {showForm ? "Close" : "New Lead"}
            </button>
          </div>
        </div>

        {xMessage && <p className="muted">{xMessage}</p>}

        {showForm && (
          <div className="lead-create-inline">
            <div className="panel-header">
              <div>
                <h2>New Lead</h2>
                <p className="muted">Keep it lightweight. You can enrich later.</p>
              </div>
            </div>
            <form onSubmit={handleCreateLead} className="form-grid">
              <label>
                Name
                <input name="name" value={form.name} onChange={handleFormChange} required />
              </label>
              <label>
                Platform
                <input name="platform" value={form.platform} onChange={handleFormChange} />
              </label>
              <label>
                Handle
                <input name="handle" value={form.handle} onChange={handleFormChange} />
              </label>
              <label>
                Email
                <input name="email" value={form.email} onChange={handleFormChange} />
              </label>
              <label>
                Status
                <select name="status" value={form.status} onChange={handleFormChange}>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Score
                <input name="score" value={form.score} onChange={handleFormChange} />
              </label>
              <label>
                Source
                <input name="source" value={form.source} onChange={handleFormChange} />
              </label>
              <label>
                Role
                <input name="role" value={form.role} onChange={handleFormChange} />
              </label>
              <label>
                Country
                <input name="country" value={form.country} onChange={handleFormChange} />
              </label>
              <label className="span-2">
                Notes
                <textarea name="notes" value={form.notes} onChange={handleFormChange} />
              </label>
              <div className="span-2 form-actions">
                <button className="btn" type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Create Lead"}
                </button>
              </div>
            </form>
          </div>
        )}

        {loading && <p className="muted">Loading leads…</p>}
        {!loading && leads.length === 0 && (
          <p className="muted">No leads yet. Add the first one.</p>
        )}
        {!loading && leads.length > 0 && filteredLeads.length === 0 && (
          <p className="muted">No leads match "{searchTerm}".</p>
        )}

        {filteredLeads.length > 0 && (
          <div className="table-wrapper">
            <table className="lead-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Platform</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Contact</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const isSelected = lead.id === selectedLeadId

                  return (
                    <React.Fragment key={lead.id}>
                      <tr
                        className={isSelected ? "active" : ""}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedLeadId(null)
                            setEditMode(false)
                            return
                          }
                          setSelectedLeadId(lead.id)
                          setEditMode(false)
                          hydrateEditForm(lead)
                        }}
                      >
                        <td>
                          <strong>{lead.name}</strong>
                          <span className="muted">{lead.handle || "—"}</span>
                        </td>
                        <td>{lead.platform || "—"}</td>
                        <td>{lead.role || "—"}</td>
                        <td>
                          <select
                            className="status-select"
                            value={lead.status || "new"}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              handleQuickStatusChange(lead.id, event.target.value)
                            }
                          >
                            {STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {status.replace("_", " ")}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{lead.score ?? "—"}</td>
                        <td>{lead.email || "—"}</td>
                        <td>{lead.source || "—"}</td>
                      </tr>
                      {isSelected && (
                        <tr className="lead-detail-row">
                          <td colSpan={7}>
                            <div className="lead-detail-panel">
                              <div className="detail-header">
                                <div>
                                  <h3>Lead Detail</h3>
                                  <p className="muted">
                                    Capture signals, contact info, and scoring.
                                  </p>
                                </div>
                                {!editMode && (
                                  <div className="detail-actions">
                                    <button
                                      className="btn ghost"
                                      type="button"
                                      onClick={() => setEditMode(true)}
                                    >
                                      Edit details
                                    </button>
                                    <button
                                      className="btn"
                                      type="button"
                                      onClick={() => handleAiRescore(selectedLead.id)}
                                      disabled={aiRescoring[selectedLead.id]}
                                    >
                                      {aiRescoring[selectedLead.id]
                                        ? "Re-scoring…"
                                        : "Re-score AI"}
                                    </button>
                                  </div>
                                )}
                              </div>
                              {editMode ? (
                                <form onSubmit={handleUpdateLead} className="form-grid">
                                  <label>
                                    Name
                                    <input
                                      name="name"
                                      value={editForm.name}
                                      onChange={handleEditChange}
                                      required
                                    />
                                  </label>
                                  <label>
                                    Platform
                                    <input
                                      name="platform"
                                      value={editForm.platform}
                                      onChange={handleEditChange}
                                    />
                                  </label>
                                  <label>
                                    Handle
                                    <input
                                      name="handle"
                                      value={editForm.handle}
                                      onChange={handleEditChange}
                                    />
                                  </label>
                                  <label>
                                    Email
                                    <input
                                      name="email"
                                      value={editForm.email}
                                      onChange={handleEditChange}
                                    />
                                  </label>
                                  <label>
                                    Status
                                    <select
                                      name="status"
                                      value={editForm.status}
                                      onChange={handleEditChange}
                                    >
                                      {STATUS_OPTIONS.map((status) => (
                                        <option key={status} value={status}>
                                          {status.replace("_", " ")}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    Score
                                    <input
                                      name="score"
                                      value={editForm.score}
                                      onChange={handleEditChange}
                                    />
                                  </label>
                                  <label>
                                    Source
                                    <input
                                      name="source"
                                      value={editForm.source}
                                      onChange={handleEditChange}
                                    />
                                  </label>
                                  <label>
                                    Role
                                    <input
                                      name="role"
                                      value={editForm.role}
                                      onChange={handleEditChange}
                                    />
                                  </label>
                                  <label>
                                    Country
                                    <input
                                      name="country"
                                      value={editForm.country}
                                      onChange={handleEditChange}
                                    />
                                  </label>
                                  <label className="span-2">
                                    Notes
                                    <textarea
                                      name="notes"
                                      value={editForm.notes}
                                      onChange={handleEditChange}
                                    />
                                  </label>
                                  <div className="span-2 form-actions form-inline">
                                    <button className="btn" type="submit" disabled={editSaving}>
                                      {editSaving ? "Saving…" : "Save Changes"}
                                    </button>
                                    <button
                                      className="btn ghost"
                                      type="button"
                                      onClick={() => {
                                        setEditMode(false)
                                        hydrateEditForm(selectedLead)
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <div className="detail-grid">
                                  <div>
                                    <h3>{selectedLead.name}</h3>
                                    <p className="muted">{selectedLead.role || "Role unknown"}</p>
                                    <div className="detail-tags">
                                      {selectedLead.platform && (
                                        <span className="pill">{selectedLead.platform}</span>
                                      )}
                                      {selectedLead.country && (
                                        <span className="pill">{selectedLead.country}</span>
                                      )}
                                      {selectedLead.source && (
                                        <span className="pill">{selectedLead.source}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="detail-meta">
                                    <p>
                                      <span className="label">Handle</span>
                                      {selectedLead.handle ? (
                                        handleToUrl(selectedLead) ? (
                                          <a
                                            href={handleToUrl(selectedLead)}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            {selectedLead.handle}
                                          </a>
                                        ) : (
                                          selectedLead.handle
                                        )
                                      ) : (
                                        "—"
                                      )}
                                    </p>
                                    <p>
                                      <span className="label">Email</span>
                                      {selectedLead.email || "—"}
                                    </p>
                                    <p>
                                      <span className="label">Score</span>
                                      {selectedLead.score ?? "—"}
                                    </p>
                                    <p>
                                      <span className="label">Status</span>
                                      {selectedLead.status || "new"}
                                    </p>
                                  </div>
                                  <div className="detail-meta">
                                    <p>
                                      <span className="label">AI Category</span>
                                      {selectedLead.ai_category || "—"}
                                    </p>
                                    <p>
                                      <span className="label">AI Fit Score</span>
                                      {selectedLead.ai_fit_score ?? "—"}
                                    </p>
                                    <p>
                                      <span className="label">AI Confidence</span>
                                      {formatConfidence(selectedLead.ai_confidence)}
                                    </p>
                                    <p>
                                      <span className="label">Last Scored</span>
                                      {formatTimestamp(selectedLead.ai_last_scored_at)}
                                    </p>
                                  </div>
                                  <div className="detail-notes">
                                    <span className="label">Notes</span>
                                    <p>{selectedLead.notes || "No notes yet."}</p>
                                  </div>
                                  {selectedLead.ai_reason && (
                                    <div className="detail-notes">
                                      <span className="label">AI Rationale</span>
                                      <p>{selectedLead.ai_reason}</p>
                                    </div>
                                  )}
                                  <button
                                    className="btn ghost"
                                    type="button"
                                    onClick={() => handleDeleteLead(selectedLead.id)}
                                  >
                                    Delete Lead
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && (
        <div className="panel error">
          <p>Something went wrong. Check the console and try again.</p>
        </div>
      )}
    </div>
  )
}
