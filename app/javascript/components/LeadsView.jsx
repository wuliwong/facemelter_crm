import React, { useEffect, useMemo, useRef, useState } from "react"
import { apiRequest } from "./api"

const STATUS_OPTIONS = [
  "new",
  "needs_review",
  "contacted",
  "engaged",
  "interested",
  "onboarding",
  "active",
  "closed",
  "archived"
]
const DEFAULT_STATUS_FILTER = "open"
const STATUS_FILTER_OPTIONS = [DEFAULT_STATUS_FILTER, "all", ...STATUS_OPTIONS]
const DEFAULT_CATEGORY_FILTER = "all"
const COMMUNICATION_CHANNEL_OPTIONS = [
  "x_dm",
  "x_comment",
  "followed_on_x",
  "linkedin_dm",
  "linkedin_comment",
  "connected_on_linkedin",
  "email",
  "youtube_comment",
  "instagram_dm",
  "reddit_dm",
  "phone_call",
  "other"
]
const COMMUNICATION_OUTCOME_OPTIONS = [
  "sent",
  "no_response",
  "replied",
  "in_conversation",
  "meeting_scheduled",
  "not_interested",
  "converted"
]

const statusFilterFromUrl = () => {
  if (typeof window === "undefined") return DEFAULT_STATUS_FILTER
  const raw = new URLSearchParams(window.location.search).get("status")
  if (raw === DEFAULT_STATUS_FILTER || raw === "all" || STATUS_OPTIONS.includes(raw)) return raw
  return DEFAULT_STATUS_FILTER
}

const categoryFilterFromUrl = () => {
  if (typeof window === "undefined") return DEFAULT_CATEGORY_FILTER
  const raw = new URLSearchParams(window.location.search).get("category")
  return raw || DEFAULT_CATEGORY_FILTER
}

const writeStatusFilterToUrl = (status) => {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (!status || status === DEFAULT_STATUS_FILTER) {
    url.searchParams.delete("status")
  } else {
    url.searchParams.set("status", status)
  }
  window.history.replaceState({}, "", url)
}

const writeCategoryFilterToUrl = (category) => {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (!category || category === DEFAULT_CATEGORY_FILTER) {
    url.searchParams.delete("category")
  } else {
    url.searchParams.set("category", category)
  }
  window.history.replaceState({}, "", url)
}

const EMPTY_FORM = {
  name: "",
  platform: "",
  handle: "",
  email: "",
  website: "",
  status: "new",
  ai_category: "",
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
  "website",
  "status",
  "ai_category",
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

  if (!payload.ai_category) {
    payload.ai_category = null
  }

  if (!payload.website) {
    payload.website = null
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

const toDateTimeInputValue = (value) => {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ""

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const emptyCommunicationForm = (channelOptions = COMMUNICATION_CHANNEL_OPTIONS) => ({
  channel: channelOptions[0] || "other",
  outcome: "sent",
  occurred_at: toDateTimeInputValue(),
  responded_at: "",
  link: "",
  summary: "",
  notes: ""
})

const communicationToForm = (
  communication,
  channelOptions = COMMUNICATION_CHANNEL_OPTIONS
) => ({
  channel: communication?.channel || channelOptions[0] || "other",
  outcome: communication?.outcome || "sent",
  occurred_at: toDateTimeInputValue(communication?.occurred_at),
  responded_at: communication?.responded_at
    ? toDateTimeInputValue(communication.responded_at)
    : "",
  link: communication?.link || "",
  summary: communication?.summary || "",
  notes: communication?.notes || ""
})

const normalizeHandle = (value) => (value || "").toString().trim()
const HIDDEN_BY_DEFAULT_STATUSES = new Set(["closed", "archived"])

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

const dossierFilenameFallback = (lead) => {
  const normalizedName = (lead?.name || "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `lead-dossier-${normalizedName || lead?.id || "download"}.pdf`
}

const filenameFromContentDisposition = (contentDisposition, fallbackName) => {
  const value = (contentDisposition || "").toString()
  if (!value) return fallbackName

  const utfMatch = value.match(/filename\*=UTF-8''([^;]+)/i)
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1])
    } catch {
      return utfMatch[1]
    }
  }

  const basicMatch = value.match(/filename=\"?([^\";]+)\"?/i)
  if (basicMatch?.[1]) return basicMatch[1]

  return fallbackName
}

const removeUrlFromProfileMap = (profilesMap, profileType, targetUrl) => {
  if (!profilesMap || typeof profilesMap !== "object") return profilesMap

  const nextProfiles = { ...profilesMap }

  if (profileType && Array.isArray(nextProfiles[profileType])) {
    const filtered = nextProfiles[profileType].filter((url) => url !== targetUrl)
    if (filtered.length > 0) {
      nextProfiles[profileType] = filtered
    } else {
      delete nextProfiles[profileType]
    }
    return nextProfiles
  }

  Object.entries(nextProfiles).forEach(([key, urls]) => {
    if (!Array.isArray(urls)) return
    const filtered = urls.filter((url) => url !== targetUrl)
    if (filtered.length > 0) {
      nextProfiles[key] = filtered
    } else {
      delete nextProfiles[key]
    }
  })

  return nextProfiles
}

const withSocialProfileRemoved = (lead, profile) => {
  const nextLead = { ...lead }

  if (Array.isArray(nextLead.social_profiles)) {
    nextLead.social_profiles = nextLead.social_profiles.filter(
      (item) => item.id !== profile.id
    )
  } else {
    nextLead.social_profiles = []
  }

  if (
    nextLead.deep_dive_data &&
    typeof nextLead.deep_dive_data === "object" &&
    nextLead.deep_dive_data.profiles &&
    typeof nextLead.deep_dive_data.profiles === "object"
  ) {
    nextLead.deep_dive_data = {
      ...nextLead.deep_dive_data,
      profiles: removeUrlFromProfileMap(
        nextLead.deep_dive_data.profiles,
        profile.profile_type,
        profile.url
      )
    }
  }

  return nextLead
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
  const [liQuery, setLiQuery] = useState("")
  const [liLoading, setLiLoading] = useState(false)
  const [liMessage, setLiMessage] = useState("")
  const [statusFilter, setStatusFilter] = useState(statusFilterFromUrl)
  const [categoryFilter, setCategoryFilter] = useState(categoryFilterFromUrl)
  const [categoryOptions, setCategoryOptions] = useState([])
  const [communicationsByLead, setCommunicationsByLead] = useState({})
  const [communicationOptions, setCommunicationOptions] = useState({
    channels: COMMUNICATION_CHANNEL_OPTIONS,
    outcomes: COMMUNICATION_OUTCOME_OPTIONS
  })
  const [communicationForm, setCommunicationForm] = useState(() => emptyCommunicationForm())
  const [communicationSaving, setCommunicationSaving] = useState(false)
  const [communicationLoading, setCommunicationLoading] = useState(false)
  const [communicationEditingId, setCommunicationEditingId] = useState(null)
  const [communicationEditForm, setCommunicationEditForm] = useState(() =>
    emptyCommunicationForm()
  )
  const [communicationEditSaving, setCommunicationEditSaving] = useState(false)
  const [aiRescoring, setAiRescoring] = useState({})
  const [aiMessages, setAiMessages] = useState({})
  const [deepDiving, setDeepDiving] = useState({})
  const [deepDiveMessages, setDeepDiveMessages] = useState({})
  const [firstContactGenerating, setFirstContactGenerating] = useState({})
  const [firstContactMessages, setFirstContactMessages] = useState({})
  const [dossierDownloading, setDossierDownloading] = useState({})
  const [tuningDatasetDownloading, setTuningDatasetDownloading] = useState(false)
  const [tuningFeedbackSaving, setTuningFeedbackSaving] = useState({})
  const [profileDeletingById, setProfileDeletingById] = useState({})
  const rescoreTimersRef = useRef({})
  const deepDiveTimersRef = useRef({})
  const firstContactTimersRef = useRef({})
  const xSearchPollTimerRef = useRef(null)
  const liSearchPollTimerRef = useRef(null)
  const aiModel =
    typeof document !== "undefined"
      ? document.querySelector('meta[name="ai-model"]')?.content || ""
      : ""

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const nameMatch =
        !normalizedSearch || (lead.name || "").toLowerCase().includes(normalizedSearch)
      const leadStatus = lead.status || "new"
      const statusMatch =
        statusFilter === "all"
          ? true
          : statusFilter === DEFAULT_STATUS_FILTER
            ? !HIDDEN_BY_DEFAULT_STATUSES.has(leadStatus)
            : leadStatus === statusFilter
      const leadCategory = (lead.ai_category || "").toString().trim()
      const categoryMatch =
        categoryFilter === DEFAULT_CATEGORY_FILTER
          ? true
          : categoryFilter === "uncategorized"
            ? !leadCategory
            : leadCategory === categoryFilter
      return nameMatch && statusMatch && categoryMatch
    })
  }, [leads, normalizedSearch, statusFilter, categoryFilter])

  const statsSource = filteredLeads
  const totalLeads = statsSource.length
  const whiteGlove = statsSource.filter((lead) => (lead.score || 0) >= 6).length
  const contacted = statsSource.filter((lead) =>
    ["contacted", "engaged"].includes(lead.status)
  ).length

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId),
    [leads, selectedLeadId]
  )
  const selectedLeadSearchWarnings = useMemo(() => {
    if (!selectedLead?.deep_dive_data) return []
    const warnings = selectedLead.deep_dive_data.search_warnings
    return Array.isArray(warnings) ? warnings.filter(Boolean) : []
  }, [selectedLead])
  const selectedLeadCommunications = selectedLeadId
    ? communicationsByLead[selectedLeadId] || []
    : []

  useEffect(() => {
    if (!selectedLeadId) return
    if (filteredLeads.some((lead) => lead.id === selectedLeadId)) return
    setSelectedLeadId(null)
    setEditMode(false)
  }, [filteredLeads, selectedLeadId])

  useEffect(() => {
    if (!selectedLeadId) return
    setCommunicationForm(emptyCommunicationForm(communicationOptions.channels))
    setCommunicationEditingId(null)
    setCommunicationEditForm(emptyCommunicationForm(communicationOptions.channels))
    fetchLeadCommunications(selectedLeadId)
  }, [selectedLeadId])

  const fetchLeads = async (options = {}) => {
    const { keepSelection = false } = options
    const data = await apiRequest("/api/leads")
    const nextLeads = data.leads || []
    setLeads(nextLeads)
    if (Array.isArray(data.ai_category_options)) {
      setCategoryOptions(data.ai_category_options)
    }

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

  const fetchLeadCommunications = async (leadId) => {
    setCommunicationLoading(true)
    try {
      const data = await apiRequest(`/api/leads/${leadId}/communications`)
      setCommunicationsByLead((prev) => ({
        ...prev,
        [leadId]: data.communications || []
      }))

      const channels = Array.isArray(data.channel_options)
        ? data.channel_options
        : COMMUNICATION_CHANNEL_OPTIONS
      const outcomes = Array.isArray(data.outcome_options)
        ? data.outcome_options
        : COMMUNICATION_OUTCOME_OPTIONS

      setCommunicationOptions({ channels, outcomes })
      setCommunicationForm((prev) => ({
        ...emptyCommunicationForm(channels),
        ...prev,
        channel: prev.channel || channels[0] || "other",
        outcome: prev.outcome || "sent"
      }))
    } catch (err) {
      setError(err)
    } finally {
      setCommunicationLoading(false)
    }
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
      Object.values(deepDiveTimersRef.current).forEach(clearTimeout)
      deepDiveTimersRef.current = {}
      Object.values(firstContactTimersRef.current).forEach(clearTimeout)
      firstContactTimersRef.current = {}
      if (xSearchPollTimerRef.current) {
        clearTimeout(xSearchPollTimerRef.current)
        xSearchPollTimerRef.current = null
      }
      if (liSearchPollTimerRef.current) {
        clearTimeout(liSearchPollTimerRef.current)
        liSearchPollTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    writeStatusFilterToUrl(statusFilter)
  }, [statusFilter])

  useEffect(() => {
    writeCategoryFilterToUrl(categoryFilter)
  }, [categoryFilter])

  const effectiveCategoryOptions = useMemo(() => {
    const fromLeads = leads
      .map((lead) => (lead.ai_category || "").toString().trim())
      .filter((value) => value.length > 0)
    return Array.from(new Set([...categoryOptions, ...fromLeads]))
  }, [categoryOptions, leads])

  const hydrateEditForm = (lead) => {
    setEditForm({
      ...EMPTY_FORM,
      ...lead,
      website: lead.website ?? "",
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

  const handleCommunicationChange = (event) => {
    const { name, value } = event.target
    setCommunicationForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleCommunicationEditChange = (event) => {
    const { name, value } = event.target
    setCommunicationEditForm((prev) => ({ ...prev, [name]: value }))
  }

  const startCommunicationEdit = (communication) => {
    setCommunicationEditingId(communication.id)
    setCommunicationEditForm(
      communicationToForm(communication, communicationOptions.channels)
    )
  }

  const cancelCommunicationEdit = () => {
    setCommunicationEditingId(null)
    setCommunicationEditForm(emptyCommunicationForm(communicationOptions.channels))
  }

  const handleCreateCommunication = async (event, leadId) => {
    event.preventDefault()
    if (!leadId) return

    setCommunicationSaving(true)
    setError(null)

    try {
      const payload = {
        ...communicationForm,
        responded_at: communicationForm.responded_at || null,
        link: communicationForm.link || null,
        summary: communicationForm.summary || null,
        notes: communicationForm.notes || null
      }

      const data = await apiRequest(`/api/leads/${leadId}/communications`, {
        method: "POST",
        body: { communication: payload }
      })

      setCommunicationsByLead((prev) => ({
        ...prev,
        [leadId]: [data.communication, ...(prev[leadId] || [])]
      }))
      setCommunicationForm(emptyCommunicationForm(communicationOptions.channels))
    } catch (err) {
      setError(err)
    } finally {
      setCommunicationSaving(false)
    }
  }

  const handleUpdateCommunication = async (event, leadId, communicationId) => {
    event.preventDefault()
    if (!leadId || !communicationId) return

    setCommunicationEditSaving(true)
    setError(null)

    try {
      const payload = {
        ...communicationEditForm,
        responded_at: communicationEditForm.responded_at || null,
        link: communicationEditForm.link || null,
        summary: communicationEditForm.summary || null,
        notes: communicationEditForm.notes || null
      }

      const data = await apiRequest(`/api/leads/${leadId}/communications/${communicationId}`, {
        method: "PATCH",
        body: { communication: payload }
      })

      setCommunicationsByLead((prev) => ({
        ...prev,
        [leadId]: (prev[leadId] || []).map((entry) =>
          entry.id === communicationId ? data.communication : entry
        )
      }))
      setCommunicationEditingId(null)
      setCommunicationEditForm(emptyCommunicationForm(communicationOptions.channels))
    } catch (err) {
      setError(err)
    } finally {
      setCommunicationEditSaving(false)
    }
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

  const pollLeadsAfterLiSearch = (knownLeadIds, initialSize, attemptsLeft) => {
    if (attemptsLeft <= 0) {
      setLiMessage((prev) =>
        prev.includes("new lead")
          ? prev
          : "LinkedIn search queued. Waiting for results. If jobs are still running, they will keep appearing."
      )
      liSearchPollTimerRef.current = null
      return
    }

    liSearchPollTimerRef.current = setTimeout(async () => {
      try {
        const nextLeads = await fetchLeads({ keepSelection: true })
        nextLeads.forEach((lead) => knownLeadIds.add(lead.id))
        const totalNew = knownLeadIds.size - initialSize

        if (totalNew > 0) {
          setLiMessage(
            `LinkedIn search running. ${totalNew} new lead${totalNew === 1 ? "" : "s"} added.`
          )
        } else {
          setLiMessage("LinkedIn search queued. Waiting for new leads…")
        }
      } catch (_err) {
        // transient fetch errors should not break the polling loop
      }

      pollLeadsAfterLiSearch(knownLeadIds, initialSize, attemptsLeft - 1)
    }, 4000)
  }

  const handleLinkedinSearch = async (event) => {
    event.preventDefault()
    const query = liQuery.trim()
    if (!query) return

    setLiLoading(true)
    setLiMessage("")
    setError(null)

    try {
      await apiRequest("/api/linkedin/search", {
        method: "POST",
        body: { query, limit: 25 }
      })
      if (liSearchPollTimerRef.current) {
        clearTimeout(liSearchPollTimerRef.current)
        liSearchPollTimerRef.current = null
      }

      const knownLeadIds = new Set(leads.map((lead) => lead.id))
      const initialSize = knownLeadIds.size
      setLiMessage("LinkedIn search queued. Watching for incoming leads…")
      pollLeadsAfterLiSearch(knownLeadIds, initialSize, 30)
      setLiQuery("")
    } catch (err) {
      setError(err)
      setLiMessage("Could not queue LinkedIn search. Check your query and try again.")
    } finally {
      setLiLoading(false)
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

  const handleDeleteSocialProfile = async (leadId, profile) => {
    if (!profile?.id) return
    if (!confirm("Delete this link from the lead?")) return

    setProfileDeletingById((prev) => ({ ...prev, [profile.id]: true }))
    setError(null)

    try {
      await apiRequest(`/api/leads/${leadId}/social_profiles/${profile.id}`, {
        method: "DELETE"
      })
      setLeads((prev) =>
        prev.map((lead) => (lead.id === leadId ? withSocialProfileRemoved(lead, profile) : lead))
      )
    } catch (err) {
      setError(err)
    } finally {
      setProfileDeletingById((prev) => {
        const next = { ...prev }
        delete next[profile.id]
        return next
      })
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

  const refreshLeadAfterDeepDive = async (leadId, previousRunAt) => {
    const data = await apiRequest(`/api/leads/${leadId}`)
    const updated = data.lead
    setLeads((prev) => prev.map((lead) => (lead.id === leadId ? { ...lead, ...updated } : lead)))

    const status = updated.deep_dive_status || "idle"
    const finished = status === "complete" || status === "failed"
    const runChanged =
      updated.deep_dive_last_run_at && updated.deep_dive_last_run_at !== previousRunAt

    if (finished && runChanged) {
      const hasSearchWarnings =
        Array.isArray(updated.deep_dive_data?.search_warnings) &&
        updated.deep_dive_data.search_warnings.length > 0
      const message =
        status === "complete"
          ? hasSearchWarnings
            ? "Deep dive completed with SERPER/Google warning. Review warning banner."
            : "Deep dive completed."
          : updated.deep_dive_error || "Deep dive failed. Check logs and try again."
      setDeepDiveMessages((prev) => ({ ...prev, [leadId]: message }))
      return true
    }

    if (finished && !previousRunAt && updated.deep_dive_last_run_at) {
      const hasSearchWarnings =
        Array.isArray(updated.deep_dive_data?.search_warnings) &&
        updated.deep_dive_data.search_warnings.length > 0
      const message =
        status === "complete"
          ? hasSearchWarnings
            ? "Deep dive completed with SERPER/Google warning. Review warning banner."
            : "Deep dive completed."
          : updated.deep_dive_error || "Deep dive failed. Check logs and try again."
      setDeepDiveMessages((prev) => ({ ...prev, [leadId]: message }))
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

  const pollLeadForDeepDive = (leadId, previousRunAt, attemptsLeft, intervalMs = 5000) => {
    if (attemptsLeft <= 0) {
      setDeepDiveMessages((prev) => ({
        ...prev,
        [leadId]: "Deep dive is taking longer than usual. Still checking for results…"
      }))
      pollLeadForDeepDive(leadId, previousRunAt, 24, 15000)
      return
    }

    deepDiveTimersRef.current[leadId] = setTimeout(async () => {
      try {
        const done = await refreshLeadAfterDeepDive(leadId, previousRunAt)
        if (done) {
          setDeepDiving((prev) => ({ ...prev, [leadId]: false }))
          delete deepDiveTimersRef.current[leadId]
          return
        }
      } catch (_err) {
        // Keep polling through transient errors.
      }

      pollLeadForDeepDive(leadId, previousRunAt, attemptsLeft - 1, intervalMs)
    }, intervalMs)
  }

  const handleDeepDive = async (leadId) => {
    if (deepDiving[leadId]) return

    setDeepDiving((prev) => ({ ...prev, [leadId]: true }))
    setDeepDiveMessages((prev) => ({ ...prev, [leadId]: "" }))
    setError(null)

    try {
      if (deepDiveTimersRef.current[leadId]) {
        clearTimeout(deepDiveTimersRef.current[leadId])
        delete deepDiveTimersRef.current[leadId]
      }

      await apiRequest(`/api/leads/${leadId}/deep_dive`, { method: "POST" })
      setDeepDiveMessages((prev) => ({
        ...prev,
        [leadId]: "Deep dive queued. Watching for results…"
      }))

      const previousRunAt =
        leads.find((lead) => lead.id === leadId)?.deep_dive_last_run_at || null
      pollLeadForDeepDive(leadId, previousRunAt, 60)
    } catch (err) {
      setError(err)
      setDeepDiveMessages((prev) => ({
        ...prev,
        [leadId]: "Could not queue deep dive. Check logs and try again."
      }))
      setDeepDiving((prev) => ({ ...prev, [leadId]: false }))
    }
  }

  const refreshLeadAfterFirstContact = async (leadId, previousRunAt) => {
    const data = await apiRequest(`/api/leads/${leadId}`)
    const updated = data.lead
    setLeads((prev) => prev.map((lead) => (lead.id === leadId ? { ...lead, ...updated } : lead)))

    const status = updated.first_contact_status || "idle"
    const finished = status === "complete" || status === "failed"
    const runChanged =
      updated.first_contact_last_run_at && updated.first_contact_last_run_at !== previousRunAt

    if (finished && runChanged) {
      const message =
        status === "complete"
          ? "First contact suggestion ready."
          : updated.first_contact_error || "Suggestion failed. Check logs and try again."
      setFirstContactMessages((prev) => ({ ...prev, [leadId]: message }))
      return true
    }

    return false
  }

  const pollLeadForFirstContact = (leadId, previousRunAt, attemptsLeft) => {
    if (attemptsLeft <= 0) {
      setFirstContactMessages((prev) => ({
        ...prev,
        [leadId]: "Timed out waiting for first contact suggestion."
      }))
      setFirstContactGenerating((prev) => ({ ...prev, [leadId]: false }))
      delete firstContactTimersRef.current[leadId]
      return
    }

    firstContactTimersRef.current[leadId] = setTimeout(async () => {
      try {
        const done = await refreshLeadAfterFirstContact(leadId, previousRunAt)
        if (done) {
          setFirstContactGenerating((prev) => ({ ...prev, [leadId]: false }))
          delete firstContactTimersRef.current[leadId]
          return
        }
      } catch (_err) {
        // Keep polling through transient errors.
      }

      pollLeadForFirstContact(leadId, previousRunAt, attemptsLeft - 1)
    }, 5000)
  }

  const handleSuggestFirstContact = async (leadId) => {
    if (firstContactGenerating[leadId]) return

    setFirstContactGenerating((prev) => ({ ...prev, [leadId]: true }))
    setFirstContactMessages((prev) => ({ ...prev, [leadId]: "" }))
    setError(null)

    try {
      if (firstContactTimersRef.current[leadId]) {
        clearTimeout(firstContactTimersRef.current[leadId])
        delete firstContactTimersRef.current[leadId]
      }

      await apiRequest(`/api/leads/${leadId}/suggest_first_contact`, { method: "POST" })
      setFirstContactMessages((prev) => ({
        ...prev,
        [leadId]: "Generating first contact suggestion…"
      }))

      const previousRunAt =
        leads.find((lead) => lead.id === leadId)?.first_contact_last_run_at || null
      pollLeadForFirstContact(leadId, previousRunAt, 36)
    } catch (err) {
      setError(err)
      setFirstContactMessages((prev) => ({
        ...prev,
        [leadId]: "Could not queue first contact suggestion."
      }))
      setFirstContactGenerating((prev) => ({ ...prev, [leadId]: false }))
    }
  }

  const handleDownloadDossier = async (lead) => {
    if (!lead?.id) return
    if (dossierDownloading[lead.id]) return

    setDossierDownloading((prev) => ({ ...prev, [lead.id]: true }))
    setError(null)

    try {
      const response = await fetch(`/api/leads/${lead.id}/dossier`, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/pdf"
        }
      })

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || ""
        const data = contentType.includes("application/json")
          ? await response.json().catch(() => null)
          : null
        const requestError = new Error("Request failed")
        requestError.status = response.status
        requestError.data = data
        throw requestError
      }

      const blob = await response.blob()
      const fallbackName = dossierFilenameFallback(lead)
      const filename = filenameFromContentDisposition(
        response.headers.get("content-disposition"),
        fallbackName
      )

      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      setError(err)
    } finally {
      setDossierDownloading((prev) => {
        const next = { ...prev }
        delete next[lead.id]
        return next
      })
    }
  }

  const handleLeadTuningFeedback = async (leadId, rating) => {
    if (!leadId || !["up", "down"].includes(rating)) return
    if (tuningFeedbackSaving[leadId]) return

    setTuningFeedbackSaving((prev) => ({ ...prev, [leadId]: true }))
    setError(null)

    try {
      const data = await apiRequest(`/api/leads/${leadId}/tuning_feedback`, {
        method: "POST",
        body: { feedback: { rating } }
      })

      if (data?.lead) {
        setLeads((prev) => prev.map((lead) => (lead.id === data.lead.id ? data.lead : lead)))
        if (selectedLeadId === data.lead.id) {
          hydrateEditForm(data.lead)
        }
      }
    } catch (err) {
      setError(err)
    } finally {
      setTuningFeedbackSaving((prev) => {
        const next = { ...prev }
        delete next[leadId]
        return next
      })
    }
  }

  const handleDownloadTuningDataset = async () => {
    if (tuningDatasetDownloading) return

    setTuningDatasetDownloading(true)
    setError(null)

    try {
      const response = await fetch("/api/leads/tuning_dataset", {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/x-ndjson,application/json"
        }
      })

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || ""
        const data = contentType.includes("application/json")
          ? await response.json().catch(() => null)
          : null
        const requestError = new Error("Request failed")
        requestError.status = response.status
        requestError.data = data
        throw requestError
      }

      const blob = await response.blob()
      const filename = filenameFromContentDisposition(
        response.headers.get("content-disposition"),
        `lead-tuning-dataset-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.jsonl`
      )
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      setError(err)
    } finally {
      setTuningDatasetDownloading(false)
    }
  }

  const activeAiMessages = Object.entries(aiMessages).filter(([, msg]) => msg)
  const activeDeepDiveMessages = Object.entries(deepDiveMessages).filter(([, msg]) => msg)
  const activeFirstContactMessages = Object.entries(firstContactMessages).filter(([, msg]) => msg)
  const activeNotifications = [
    ...activeAiMessages.map(([leadId, message]) => ({
      key: `ai-${leadId}`,
      leadId,
      message,
      kind: "ai"
    })),
    ...activeDeepDiveMessages.map(([leadId, message]) => ({
      key: `deep-dive-${leadId}`,
      leadId,
      message,
      kind: "deep_dive"
    })),
    ...activeFirstContactMessages.map(([leadId, message]) => ({
      key: `first-contact-${leadId}`,
      leadId,
      message,
      kind: "first_contact"
    }))
  ]
  const errorMessages = Array.isArray(error?.data?.errors) && error.data.errors.length > 0
    ? error.data.errors
    : null

  return (
    <div className="leads-page">
      {activeNotifications.length > 0 && (
        <div className="flash-stack" role="status" aria-live="polite">
          {activeNotifications.map(({ key, leadId, message, kind }) => {
            const lead = leads.find((l) => l.id === Number(leadId))
            const name = lead?.name || "Lead"
            const inProgress =
              kind === "ai"
                ? aiRescoring[leadId]
                : kind === "deep_dive"
                  ? deepDiving[leadId]
                  : firstContactGenerating[leadId]
            const successMessage = kind === "ai"
              ? "AI score updated."
              : kind === "deep_dive"
                ? "Deep dive completed."
                : "First contact suggestion ready."
            const isWarning = kind === "deep_dive" && message.toLowerCase().includes("warning")
            const type = isWarning
              ? "critical"
              : message === successMessage
                ? "success"
                : inProgress
                  ? "info"
                  : "alert"
            return (
              <div key={key} className={`flash ${type}`}>
                <span>
                  <strong>{name}:</strong> {message}
                </span>
                {!inProgress && (
                  <button
                    className="flash-dismiss"
                    type="button"
                    aria-label="Dismiss"
                    onClick={() =>
                      (kind === "ai"
                        ? setAiMessages
                        : kind === "deep_dive"
                          ? setDeepDiveMessages
                          : setFirstContactMessages)((prev) => {
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
            <h2>Prospect list</h2>
            <p className="muted">Filter, search, and prioritize active leads.</p>
          </div>
          <div className="panel-actions">
            <label className="inline-filter">
              <span className="label">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label="Filter by status"
              >
                {STATUS_FILTER_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status === DEFAULT_STATUS_FILTER
                      ? "Open leads"
                      : status === "all"
                        ? "All statuses"
                        : status.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-filter">
              <span className="label">Category</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                aria-label="Filter by category"
              >
                <option value={DEFAULT_CATEGORY_FILTER}>All categories</option>
                <option value="uncategorized">Uncategorized</option>
                {effectiveCategoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
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
            <form className="inline-search" onSubmit={handleLinkedinSearch}>
              <input
                value={liQuery}
                onChange={(event) => setLiQuery(event.target.value)}
                placeholder="Search LinkedIn (e.g. vfx supervisor)"
                aria-label="Search LinkedIn"
              />
              <button className="btn btn-sm" type="submit" disabled={liLoading}>
                {liLoading ? "Queuing…" : "Run LinkedIn search"}
              </button>
            </form>
            {aiModel && (
              <span className="pill ai-model" title="Active AI model">
                Model: {aiModel}
              </span>
            )}
            <button
              className="btn ghost"
              type="button"
              onClick={handleDownloadTuningDataset}
              disabled={tuningDatasetDownloading}
            >
              {tuningDatasetDownloading ? "Preparing dataset…" : "Download Tuning Dataset"}
            </button>
            <button className="btn" onClick={() => setShowForm((prev) => !prev)}>
              {showForm ? "Close" : "New Lead"}
            </button>
          </div>
        </div>

        {xMessage && <p className="muted">{xMessage}</p>}
        {liMessage && <p className="muted">{liMessage}</p>}

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
                Website
                <input name="website" value={form.website} onChange={handleFormChange} />
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
                Category
                <select
                  name="ai_category"
                  value={form.ai_category}
                  onChange={handleFormChange}
                >
                  <option value="">Uncategorized</option>
                  {effectiveCategoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category.replaceAll("_", " ")}
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
          <p className="muted">
            No leads match your current filters
            {searchTerm ? ` ("${searchTerm}")` : ""}.
          </p>
        )}

        {filteredLeads.length > 0 && (
          <div className="table-wrapper">
            <table className="lead-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Platform</th>
                  <th>Role</th>
                  <th>Category</th>
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
                        <td>{lead.ai_category ? lead.ai_category.replaceAll("_", " ") : "—"}</td>
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
                          <td colSpan={8}>
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
                                      className="btn danger"
                                      type="button"
                                      onClick={() => handleDeleteLead(selectedLead.id)}
                                    >
                                      Delete Lead
                                    </button>
                                    <button
                                      className="btn ghost"
                                      type="button"
                                      onClick={() => handleDownloadDossier(selectedLead)}
                                      disabled={Boolean(dossierDownloading[selectedLead.id])}
                                    >
                                      {dossierDownloading[selectedLead.id]
                                        ? "Preparing PDF…"
                                        : "Download Lead"}
                                    </button>
                                    <button
                                      className={
                                        selectedLead.tuning_feedback_rating === "up" ? "btn" : "btn ghost"
                                      }
                                      type="button"
                                      onClick={() =>
                                        handleLeadTuningFeedback(selectedLead.id, "up")
                                      }
                                      disabled={Boolean(tuningFeedbackSaving[selectedLead.id])}
                                      title="Mark as a correct/high-fit example for tuning dataset"
                                      aria-label="Thumb up lead"
                                    >
                                      <iconify-icon
                                        icon={
                                          selectedLead.tuning_feedback_rating === "up"
                                            ? "mdi:thumb-up"
                                            : "mdi:thumb-up-outline"
                                        }
                                        width="18"
                                        height="18"
                                      />
                                    </button>
                                    <button
                                      className={
                                        selectedLead.tuning_feedback_rating === "down" ? "btn danger" : "btn ghost"
                                      }
                                      type="button"
                                      onClick={() =>
                                        handleLeadTuningFeedback(selectedLead.id, "down")
                                      }
                                      disabled={Boolean(tuningFeedbackSaving[selectedLead.id])}
                                      title="Mark as a correction/low-fit example for tuning dataset"
                                      aria-label="Thumb down lead"
                                    >
                                      <iconify-icon
                                        icon={
                                          selectedLead.tuning_feedback_rating === "down"
                                            ? "mdi:thumb-down"
                                            : "mdi:thumb-down-outline"
                                        }
                                        width="18"
                                        height="18"
                                      />
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
                                    <button
                                      className="btn"
                                      type="button"
                                      onClick={() => handleDeepDive(selectedLead.id)}
                                      disabled={deepDiving[selectedLead.id]}
                                    >
                                      {deepDiving[selectedLead.id]
                                        ? "Deep diving…"
                                        : "Deep Dive"}
                                    </button>
                                    <button
                                      className="btn"
                                      type="button"
                                      onClick={() => handleSuggestFirstContact(selectedLead.id)}
                                      disabled={
                                        firstContactGenerating[selectedLead.id] ||
                                        selectedLead.deep_dive_status !== "complete"
                                      }
                                      title={
                                        selectedLead.deep_dive_status !== "complete"
                                          ? "Run Deep Dive first"
                                          : ""
                                      }
                                    >
                                      {firstContactGenerating[selectedLead.id]
                                        ? "Suggesting…"
                                        : "Suggest First Contact"}
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
                                    Website
                                    <input
                                      name="website"
                                      value={editForm.website}
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
                                    Category
                                    <select
                                      name="ai_category"
                                      value={editForm.ai_category || ""}
                                      onChange={handleEditChange}
                                    >
                                      <option value="">Uncategorized</option>
                                      {effectiveCategoryOptions.map((category) => (
                                        <option key={category} value={category}>
                                          {category.replaceAll("_", " ")}
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
                                      <span className="label">Website</span>
                                      {selectedLead.website ? (
                                        <a href={selectedLead.website} target="_blank" rel="noreferrer">
                                          {selectedLead.website}
                                        </a>
                                      ) : (
                                        "—"
                                      )}
                                    </p>
                                    <p>
                                      <span className="label">Score</span>
                                      {selectedLead.score ?? "—"}
                                    </p>
                                    <p>
                                      <span className="label">Status</span>
                                      {selectedLead.status || "new"}
                                    </p>
                                    <p>
                                      <span className="label">Tuning Feedback</span>
                                      {selectedLead.tuning_feedback_rating === "up"
                                        ? "Thumb up, included in dataset"
                                        : selectedLead.tuning_feedback_rating === "down"
                                          ? "Thumb down, included in dataset"
                                          : "Not reviewed"}
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
                                  <div className="detail-meta">
                                    <p>
                                      <span className="label">Deep Dive Status</span>
                                      {selectedLead.deep_dive_status || "idle"}
                                    </p>
                                    <p>
                                      <span className="label">Deep Dive Last Run</span>
                                      {formatTimestamp(selectedLead.deep_dive_last_run_at)}
                                    </p>
                                  </div>
                                  <div className="detail-meta">
                                    <p>
                                      <span className="label">First Contact Status</span>
                                      {selectedLead.first_contact_status || "idle"}
                                    </p>
                                    <p>
                                      <span className="label">First Contact Last Run</span>
                                      {formatTimestamp(selectedLead.first_contact_last_run_at)}
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
                                  {selectedLeadSearchWarnings.length > 0 && (
                                    <div className="search-warning-banner" role="alert">
                                      <strong>SERPER/GOOGLE SEARCH WARNING</strong>
                                      <p>
                                        Lead enrichment search failed and likely used fallback data.
                                        Check Serper credits/API key before trusting discovered links.
                                      </p>
                                      <ul>
                                        {selectedLeadSearchWarnings.map((warning) => (
                                          <li key={warning}>{warning}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  <div className="detail-notes">
                                    <span className="label">Deep Dive Summary</span>
                                    <p>
                                      {selectedLead.deep_dive_data?.summary ||
                                        "Run deep dive to enrich profiles and context."}
                                    </p>
                                    {selectedLead.deep_dive_data?.outreach_angle && (
                                      <p>
                                        <strong>Outreach angle:</strong>{" "}
                                        {selectedLead.deep_dive_data.outreach_angle}
                                      </p>
                                    )}
                                    {selectedLead.deep_dive_data?.next_step && (
                                      <p>
                                        <strong>Suggested next step:</strong>{" "}
                                        {selectedLead.deep_dive_data.next_step}
                                      </p>
                                    )}
                                    {selectedLead.deep_dive_error && (
                                      <p className="muted">
                                        <strong>Last error:</strong> {selectedLead.deep_dive_error}
                                      </p>
                                    )}
                                    {Array.isArray(selectedLead.deep_dive_data?.highlights) &&
                                      selectedLead.deep_dive_data.highlights.length > 0 && (
                                        <div className="detail-tags">
                                          {selectedLead.deep_dive_data.highlights.map((highlight) => (
                                            <span className="pill" key={highlight}>
                                              {highlight}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    {Array.isArray(selectedLead.deep_dive_data?.emails_found) &&
                                      selectedLead.deep_dive_data.emails_found.length > 0 && (
                                        <div className="detail-grid deep-dive-links">
                                          <div>
                                            <span className="label">Emails Found</span>
                                            <div className="profile-link-list">
                                              {selectedLead.deep_dive_data.emails_found.map((entry, index) => {
                                                const email =
                                                  typeof entry === "string" ? entry : entry?.email || ""
                                                const source =
                                                  typeof entry === "string" ? "" : entry?.source || ""
                                                if (!email) return null

                                                return (
                                                  <div key={`${email}-${index}`}>
                                                    <a href={`mailto:${email}`}>{email}</a>
                                                    {source && (
                                                      <p className="muted">
                                                        Source:{" "}
                                                        <a href={source} target="_blank" rel="noreferrer">
                                                          {source}
                                                        </a>
                                                      </p>
                                                    )}
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    {selectedLead.deep_dive_data?.profiles && (
                                      <div className="detail-grid deep-dive-links">
                                        {Object.entries(selectedLead.deep_dive_data.profiles)
                                          .filter(([, urls]) => Array.isArray(urls) && urls.length > 0)
                                          .map(([key, urls]) => (
                                            <div key={key}>
                                              <span className="label">{key.replaceAll("_", " ")}</span>
                                              <div className="profile-link-list">
                                                {urls.map((url) => (
                                                  <a key={url} href={url} target="_blank" rel="noreferrer">
                                                    {url}
                                                  </a>
                                                ))}
                                              </div>
                                            </div>
                                          ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="detail-notes">
                                    <span className="label">Social Profiles</span>
                                    {!Array.isArray(selectedLead.social_profiles) ||
                                    selectedLead.social_profiles.length === 0 ? (
                                      <p>No social profiles saved yet. Run Deep Dive to discover them.</p>
                                    ) : (
                                      <div className="detail-grid deep-dive-links">
                                        {selectedLead.social_profiles.map((profile) => (
                                          <div key={profile.id || `${profile.profile_type}-${profile.url}`}>
                                            <span className="label">
                                              {profile.profile_type?.replaceAll("_", " ") || "profile"}
                                            </span>
                                            <div className="profile-link-list">
                                              <div className="profile-link-row">
                                                <a href={profile.url} target="_blank" rel="noreferrer">
                                                  {profile.url}
                                                </a>
                                                {profile.id && (
                                                  <button
                                                    className="btn btn-link-danger btn-link-danger-sm"
                                                    type="button"
                                                    onClick={() =>
                                                      handleDeleteSocialProfile(
                                                        selectedLead.id,
                                                        profile
                                                      )
                                                    }
                                                    disabled={Boolean(
                                                      profileDeletingById[profile.id]
                                                    )}
                                                  >
                                                    {profileDeletingById[profile.id]
                                                      ? "Deleting…"
                                                      : "Delete"}
                                                  </button>
                                                )}
                                              </div>
                                              {profile.handle && <span className="muted">@{profile.handle}</span>}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="detail-notes">
                                    <span className="label">Suggested First Contact</span>
                                    {selectedLead.deep_dive_data?.first_contact_suggestion ? (
                                      <>
                                        <p>
                                          <strong>Method:</strong>{" "}
                                          {selectedLead.deep_dive_data.first_contact_suggestion.method}
                                        </p>
                                        <p>
                                          <strong>Channel:</strong>{" "}
                                          {selectedLead.deep_dive_data.first_contact_suggestion.channel}
                                        </p>
                                        <p>
                                          <strong>Subject / opener:</strong>{" "}
                                          {selectedLead.deep_dive_data.first_contact_suggestion.subject_line}
                                        </p>
                                        <p>
                                          <strong>Message:</strong>{" "}
                                          {selectedLead.deep_dive_data.first_contact_suggestion.message}
                                        </p>
                                        <p>
                                          <strong>Why:</strong>{" "}
                                          {selectedLead.deep_dive_data.first_contact_suggestion.rationale}
                                        </p>
                                      </>
                                    ) : (
                                      <p>Click “Suggest First Contact” after Deep Dive completes.</p>
                                    )}
                                    {selectedLead.first_contact_error && (
                                      <p className="muted">
                                        <strong>Last error:</strong> {selectedLead.first_contact_error}
                                      </p>
                                    )}
                                  </div>
                                  <div className="detail-communications">
                                    <div className="panel-header">
                                      <div>
                                        <h3>Contact Log</h3>
                                        <p className="muted">
                                          Track where you contacted them and what happened.
                                        </p>
                                      </div>
                                    </div>

                                    <form
                                      className="form-grid communication-form"
                                      onSubmit={(event) =>
                                        handleCreateCommunication(event, selectedLead.id)
                                      }
                                    >
                                      <label>
                                        Channel
                                        <select
                                          name="channel"
                                          value={communicationForm.channel}
                                          onChange={handleCommunicationChange}
                                          required
                                        >
                                          {communicationOptions.channels.map((channel) => (
                                            <option key={channel} value={channel}>
                                              {channel.replaceAll("_", " ")}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label>
                                        Outcome
                                        <select
                                          name="outcome"
                                          value={communicationForm.outcome}
                                          onChange={handleCommunicationChange}
                                          required
                                        >
                                          {communicationOptions.outcomes.map((outcome) => (
                                            <option key={outcome} value={outcome}>
                                              {outcome.replaceAll("_", " ")}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label>
                                        Contacted at
                                        <input
                                          type="datetime-local"
                                          name="occurred_at"
                                          value={communicationForm.occurred_at}
                                          onChange={handleCommunicationChange}
                                          required
                                        />
                                      </label>
                                      <label>
                                        Responded at
                                        <input
                                          type="datetime-local"
                                          name="responded_at"
                                          value={communicationForm.responded_at}
                                          onChange={handleCommunicationChange}
                                        />
                                      </label>
                                      <label className="span-2">
                                        Link
                                        <input
                                          name="link"
                                          value={communicationForm.link}
                                          onChange={handleCommunicationChange}
                                          placeholder="https://..."
                                        />
                                      </label>
                                      <label className="span-2">
                                        Summary
                                        <input
                                          name="summary"
                                          value={communicationForm.summary}
                                          onChange={handleCommunicationChange}
                                          maxLength={500}
                                          placeholder="What you sent or discussed"
                                        />
                                      </label>
                                      <label className="span-2">
                                        Notes
                                        <textarea
                                          name="notes"
                                          value={communicationForm.notes}
                                          onChange={handleCommunicationChange}
                                        />
                                      </label>
                                      <div className="span-2 form-actions">
                                        <button
                                          className="btn"
                                          type="submit"
                                          disabled={communicationSaving}
                                        >
                                          {communicationSaving ? "Saving…" : "Add Contact Log"}
                                        </button>
                                      </div>
                                    </form>

                                    {communicationLoading && (
                                      <p className="muted">Loading contact logs…</p>
                                    )}
                                    {!communicationLoading &&
                                      selectedLeadCommunications.length === 0 && (
                                        <p className="muted">
                                          No contact logs yet. Add your first touchpoint.
                                        </p>
                                      )}
                                    {!communicationLoading &&
                                      selectedLeadCommunications.length > 0 && (
                                        <div className="communication-list">
                                          {selectedLeadCommunications.map((communication) => {
                                            const isEditing =
                                              communicationEditingId === communication.id

                                            return (
                                              <article
                                                key={communication.id}
                                                className="communication-item"
                                              >
                                                <div className="communication-item-head">
                                                  <div className="detail-tags">
                                                    <span className="pill">
                                                      {communication.channel.replaceAll("_", " ")}
                                                    </span>
                                                    <span className="pill">
                                                      {communication.outcome.replaceAll("_", " ")}
                                                    </span>
                                                  </div>
                                                  <div className="communication-item-meta">
                                                    <div className="communication-item-times">
                                                      <span>
                                                        Contacted{" "}
                                                        {formatTimestamp(communication.occurred_at)}
                                                      </span>
                                                      {communication.responded_at && (
                                                        <span>
                                                          Responded{" "}
                                                          {formatTimestamp(communication.responded_at)}
                                                        </span>
                                                      )}
                                                    </div>
                                                    <div className="communication-item-actions">
                                                      <button
                                                        className="btn ghost btn-sm"
                                                        type="button"
                                                        onClick={() =>
                                                          startCommunicationEdit(communication)
                                                        }
                                                        disabled={
                                                          communicationEditSaving &&
                                                          isEditing
                                                        }
                                                      >
                                                        Edit
                                                      </button>
                                                    </div>
                                                  </div>
                                                </div>

                                                {isEditing ? (
                                                  <form
                                                    className="form-grid communication-edit-form"
                                                    onSubmit={(event) =>
                                                      handleUpdateCommunication(
                                                        event,
                                                        selectedLead.id,
                                                        communication.id
                                                      )
                                                    }
                                                  >
                                                    <label>
                                                      Channel
                                                      <select
                                                        name="channel"
                                                        value={communicationEditForm.channel}
                                                        onChange={handleCommunicationEditChange}
                                                        required
                                                      >
                                                        {communicationOptions.channels.map(
                                                          (channel) => (
                                                            <option
                                                              key={channel}
                                                              value={channel}
                                                            >
                                                              {channel.replaceAll("_", " ")}
                                                            </option>
                                                          )
                                                        )}
                                                      </select>
                                                    </label>
                                                    <label>
                                                      Outcome
                                                      <select
                                                        name="outcome"
                                                        value={communicationEditForm.outcome}
                                                        onChange={handleCommunicationEditChange}
                                                        required
                                                      >
                                                        {communicationOptions.outcomes.map(
                                                          (outcome) => (
                                                            <option
                                                              key={outcome}
                                                              value={outcome}
                                                            >
                                                              {outcome.replaceAll("_", " ")}
                                                            </option>
                                                          )
                                                        )}
                                                      </select>
                                                    </label>
                                                    <label>
                                                      Contacted at
                                                      <input
                                                        type="datetime-local"
                                                        name="occurred_at"
                                                        value={communicationEditForm.occurred_at}
                                                        onChange={handleCommunicationEditChange}
                                                        required
                                                      />
                                                    </label>
                                                    <label>
                                                      Responded at
                                                      <input
                                                        type="datetime-local"
                                                        name="responded_at"
                                                        value={communicationEditForm.responded_at}
                                                        onChange={handleCommunicationEditChange}
                                                      />
                                                    </label>
                                                    <label className="span-2">
                                                      Link
                                                      <input
                                                        name="link"
                                                        value={communicationEditForm.link}
                                                        onChange={handleCommunicationEditChange}
                                                        placeholder="https://..."
                                                      />
                                                    </label>
                                                    <label className="span-2">
                                                      Summary
                                                      <input
                                                        name="summary"
                                                        value={communicationEditForm.summary}
                                                        onChange={handleCommunicationEditChange}
                                                        maxLength={500}
                                                      />
                                                    </label>
                                                    <label className="span-2">
                                                      Notes
                                                      <textarea
                                                        name="notes"
                                                        value={communicationEditForm.notes}
                                                        onChange={handleCommunicationEditChange}
                                                      />
                                                    </label>
                                                    <div className="span-2 form-actions">
                                                      <button
                                                        className="btn"
                                                        type="submit"
                                                        disabled={communicationEditSaving}
                                                      >
                                                        {communicationEditSaving
                                                          ? "Saving…"
                                                          : "Save Contact Log"}
                                                      </button>
                                                      <button
                                                        className="btn ghost"
                                                        type="button"
                                                        onClick={cancelCommunicationEdit}
                                                        disabled={communicationEditSaving}
                                                      >
                                                        Cancel
                                                      </button>
                                                    </div>
                                                  </form>
                                                ) : (
                                                  <>
                                                    {communication.summary && (
                                                      <p>{communication.summary}</p>
                                                    )}
                                                    {communication.link && (
                                                      <p>
                                                        <a
                                                          href={communication.link}
                                                          target="_blank"
                                                          rel="noreferrer"
                                                        >
                                                          {communication.link}
                                                        </a>
                                                      </p>
                                                    )}
                                                    {communication.notes && (
                                                      <p>{communication.notes}</p>
                                                    )}
                                                  </>
                                                )}
                                              </article>
                                            )
                                          })}
                                        </div>
                                      )}
                                  </div>
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
          <p>{errorMessages ? errorMessages.join(" ") : "Something went wrong. Check the console and try again."}</p>
        </div>
      )}
    </div>
  )
}
