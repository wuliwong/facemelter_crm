import React, { useEffect, useMemo, useState } from "react"
import { apiRequest } from "./api"

const OUTREACH_STATUSES = new Set(["contacted", "engaged", "interested", "onboarding", "active"])

const toDayKey = (dateValue) => {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const buildLastSevenDays = () => {
  const days = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    days.push({
      key: toDayKey(date),
      label: date.toLocaleDateString("en-US", { weekday: "short" })
    })
  }

  return days
}

const platformBucket = (platform) => {
  const value = (platform || "").toString().toLowerCase()
  if (value.includes("youtube")) return "youtube"
  if (value.includes("x") || value.includes("twitter")) return "x"
  if (value.includes("linkedin")) return "linkedin"
  return "other"
}

export default function DashboardView() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiRequest("/api/leads")
      .then((data) => setLeads(data.leads || []))
      .finally(() => setLoading(false))
  }, [])

  const summary = useMemo(() => {
    const total = leads.length
    const whiteGlove = leads.filter((lead) => (lead.score || 0) >= 6).length
    const contacted = leads.filter((lead) => ["contacted", "engaged"].includes(lead.status)).length
    return { total, whiteGlove, contacted }
  }, [leads])

  const recentLeads = leads.slice(0, 5)

  const chartData = useMemo(() => {
    const days = buildLastSevenDays()
    const leadsPerDay = Object.fromEntries(days.map((day) => [day.key, 0]))
    const outreachPerDay = Object.fromEntries(days.map((day) => [day.key, 0]))
    const scoreSumPerDay = Object.fromEntries(days.map((day) => [day.key, 0]))
    const scoreCountPerDay = Object.fromEntries(days.map((day) => [day.key, 0]))

    const channelMix = {
      youtube: 0,
      x: 0,
      linkedin: 0,
      other: 0
    }

    leads.forEach((lead) => {
      const createdKey = toDayKey(lead.created_at)
      const updatedKey = toDayKey(lead.updated_at)

      if (createdKey && leadsPerDay[createdKey] != null) {
        leadsPerDay[createdKey] += 1
      }

      if (
        updatedKey &&
        outreachPerDay[updatedKey] != null &&
        OUTREACH_STATUSES.has((lead.status || "").toString())
      ) {
        outreachPerDay[updatedKey] += 1
      }

      const numericScore = Number(lead.score)
      if (createdKey && scoreSumPerDay[createdKey] != null && Number.isFinite(numericScore)) {
        scoreSumPerDay[createdKey] += numericScore
        scoreCountPerDay[createdKey] += 1
      }

      channelMix[platformBucket(lead.platform)] += 1
    })

    const leadSeries = days.map((day) => leadsPerDay[day.key] || 0)
    const outreachSeries = days.map((day) => outreachPerDay[day.key] || 0)

    let rollingSum = 0
    let rollingCount = 0
    const scoreTrendSeries = days.map((day) => {
      rollingSum += scoreSumPerDay[day.key] || 0
      rollingCount += scoreCountPerDay[day.key] || 0
      if (rollingCount === 0) return 0
      return Number((rollingSum / rollingCount).toFixed(1))
    })

    const mixTotal = channelMix.youtube + channelMix.x + channelMix.linkedin + channelMix.other
    const mixPercent = mixTotal > 0
      ? {
          youtube: (channelMix.youtube / mixTotal) * 100,
          x: (channelMix.x / mixTotal) * 100,
          linkedin: (channelMix.linkedin / mixTotal) * 100,
          other: (channelMix.other / mixTotal) * 100
        }
      : { youtube: 0, x: 0, linkedin: 0, other: 0 }

    return {
      dayLabels: days.map((day) => day.label),
      activity: { leads: leadSeries, outreach: outreachSeries },
      scoreTrendSeries,
      channelMix,
      mixPercent
    }
  }, [leads])

  const partnershipWatch = useMemo(
    () =>
      leads
        .filter((lead) => ["youtube", "x"].includes(platformBucket(lead.platform)))
        .sort((a, b) => {
          const scoreDiff = (b.score || 0) - (a.score || 0)
          if (scoreDiff !== 0) return scoreDiff
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
        .slice(0, 4),
    [leads]
  )

  const signalFeed = [
    { time: "Today", title: "AI short film posted on YouTube", tag: "Signal" },
    { time: "Yesterday", title: "New ComfyUI workflow breakdown", tag: "Workflow" },
    { time: "2d ago", title: "Asked about script + shot list speedup", tag: "Inbound" },
    { time: "3d ago", title: "Partner channel hit 100k subs", tag: "Partner" },
    { time: "4d ago", title: "Festival director opened for sponsorship chat", tag: "Festival" },
    { time: "5d ago", title: "Outreach reply: wants demo walkthrough", tag: "Outreach" }
  ]

  const renderBars = (values, className) => {
    const max = Math.max(...values, 1)
    return values.map((value, idx) => (
      <div
        key={`${className}-${idx}`}
        className={`bar ${className}`}
        style={{ height: `${(value / max) * 100}%` }}
      />
    ))
  }

  const renderLinePath = (values) => {
    const max = Math.max(...values, 1)
    const points = values
      .map((value, idx) => {
        const x = (idx / (values.length - 1)) * 100
        const y = 100 - (value / max) * 100
        return `${x},${y}`
      })
      .join(" ")
    return points
  }

  return (
    <div className="dashboard-grid">
      <section className="panel dashboard-span-5">
        <div className="panel-header">
          <div>
            <h2>Pipeline Snapshot</h2>
            <p className="muted">Quick read of this week’s activity.</p>
          </div>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="label">Total leads</span>
            <strong className="stat-value">{summary.total}</strong>
          </div>
          <div className="stat-card">
            <span className="label">White‑glove tier</span>
            <strong className="stat-value">{summary.whiteGlove}</strong>
          </div>
          <div className="stat-card">
            <span className="label">Contacted</span>
            <strong className="stat-value">{summary.contacted}</strong>
          </div>
          <div className="stat-card stat-highlight">
            <span className="label">Conversion focus</span>
            <strong className="stat-value">AI filmmakers</strong>
          </div>
        </div>
        {loading && <p className="muted">Loading activity…</p>}
      </section>

      <section className="panel dashboard-span-7">
        <div className="panel-header">
          <div>
            <h2>Activity Over Time</h2>
            <p className="muted">Signals captured and outreach touches this week.</p>
          </div>
        </div>
        <div className="activity-grid">
          <div className="chart-card">
            <div className="chart-header">
              <span>Leads added</span>
              <strong>Last 7 days</strong>
            </div>
            <div className="bar-chart">{renderBars(chartData.activity.leads, "primary")}</div>
            <div className="chart-labels">
              {chartData.dayLabels.map((day) => (
                <span key={`leads-${day}`}>{day}</span>
              ))}
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-header">
              <span>Outreach touches</span>
              <strong>Last 7 days</strong>
            </div>
            <div className="bar-chart">{renderBars(chartData.activity.outreach, "secondary")}</div>
            <div className="chart-labels">
              {chartData.dayLabels.map((day) => (
                <span key={`outreach-${day}`}>{day}</span>
              ))}
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-header">
              <span>Momentum</span>
              <strong>Avg score trend</strong>
            </div>
            <div className="line-chart">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <polyline
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={renderLinePath(chartData.scoreTrendSeries)}
                />
              </svg>
            </div>
            <div className="chart-labels">
              {chartData.dayLabels.map((day) => (
                <span key={`trend-${day}`}>{day}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel dashboard-span-4">
        <div className="panel-header">
          <div>
            <h2>Recent Leads</h2>
            <p className="muted">Latest additions to your queue.</p>
          </div>
        </div>
        {recentLeads.length === 0 ? (
          <p className="empty-state">No leads yet. Start with YouTube or X to populate this list.</p>
        ) : (
          <ul className="lead-items">
            {recentLeads.map((lead) => (
              <li key={lead.id} className="lead-item">
                <div>
                  <strong>{lead.name}</strong>
                  <span className="muted">{lead.platform || "Unknown platform"}</span>
                </div>
                <span className="pill">{lead.status || "new"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel dashboard-span-4">
        <div className="panel-header">
          <div>
            <h2>Next Actions</h2>
            <p className="muted">Suggested moves for white‑glove growth.</p>
          </div>
        </div>
        <ul className="action-list">
          <li>Review the top 10 AI filmmaker signals from the last 60 days.</li>
          <li>Offer a free script + shot list to two new prospects.</li>
          <li>Document feedback from your latest onboarding walkthrough.</li>
        </ul>
      </section>

      <section className="panel dashboard-span-4">
        <div className="panel-header">
          <div>
            <h2>Partnership Watch</h2>
            <p className="muted">Track influencer channels worth outreach.</p>
          </div>
        </div>
        <div className="watch-list">
          {partnershipWatch.map((lead) => (
            <div key={lead.id} className="watch-item">
              <div>
                <strong>{lead.name}</strong>
                <span className="muted">{lead.role || lead.platform || "Prospect"}</span>
              </div>
              <span className="pill">score {lead.score ?? 0}</span>
            </div>
          ))}
          {partnershipWatch.length === 0 && (
            <p className="empty-state">No X/YouTube prospects yet.</p>
          )}
        </div>
      </section>

      <section className="panel dashboard-span-3">
        <div className="panel-header">
          <div>
            <h2>Channel Mix</h2>
            <p className="muted">Share of leads by source.</p>
          </div>
        </div>
        <div className="pie-wrap">
          <div className="pie-chart">
            <svg viewBox="0 0 42 42" className="pie">
              <circle className="pie-bg" cx="21" cy="21" r="15.915" />
              <circle
                className="pie-seg seg-one"
                cx="21"
                cy="21"
                r="15.915"
                style={{
                  strokeDasharray: `${chartData.mixPercent.youtube} ${100 - chartData.mixPercent.youtube}`,
                  strokeDashoffset: 0
                }}
              />
              <circle
                className="pie-seg seg-two"
                cx="21"
                cy="21"
                r="15.915"
                style={{
                  strokeDasharray: `${chartData.mixPercent.x} ${100 - chartData.mixPercent.x}`,
                  strokeDashoffset: -chartData.mixPercent.youtube
                }}
              />
              <circle
                className="pie-seg seg-three"
                cx="21"
                cy="21"
                r="15.915"
                style={{
                  strokeDasharray: `${chartData.mixPercent.linkedin} ${100 - chartData.mixPercent.linkedin}`,
                  strokeDashoffset: -(chartData.mixPercent.youtube + chartData.mixPercent.x)
                }}
              />
              <circle
                className="pie-seg seg-four"
                cx="21"
                cy="21"
                r="15.915"
                style={{
                  strokeDasharray: `${chartData.mixPercent.other} ${100 - chartData.mixPercent.other}`,
                  strokeDashoffset: -(
                    chartData.mixPercent.youtube +
                    chartData.mixPercent.x +
                    chartData.mixPercent.linkedin
                  )
                }}
              />
            </svg>
          </div>
          <div className="pie-legend">
            <div>
              <span className="legend-swatch swatch-one"></span>
              YouTube ({chartData.channelMix.youtube})
            </div>
            <div>
              <span className="legend-swatch swatch-two"></span>
              X (Twitter) ({chartData.channelMix.x})
            </div>
            <div>
              <span className="legend-swatch swatch-three"></span>
              LinkedIn ({chartData.channelMix.linkedin})
            </div>
            <div>
              <span className="legend-swatch swatch-four"></span>
              Web / Other ({chartData.channelMix.other})
            </div>
          </div>
        </div>
      </section>

      <section className="panel dashboard-span-9">
        <div className="panel-header">
          <div>
            <h2>Signal Feed</h2>
            <p className="muted">Recent activity and outreach signals.</p>
          </div>
        </div>
        <div className="signal-feed">
          {signalFeed.map((item) => (
            <div key={item.title} className="signal-item">
              <div>
                <strong>{item.title}</strong>
                <span className="muted">{item.time}</span>
              </div>
              <span className="pill">{item.tag}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
