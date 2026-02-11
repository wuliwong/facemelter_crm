import React, { useEffect, useMemo, useState } from "react"
import { apiRequest } from "./api"

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
    const contacted = leads.filter((lead) => lead.status === "contacted").length
    return { total, whiteGlove, contacted }
  }, [leads])

  const recentLeads = leads.slice(0, 5)
  const activity = {
    leads: [3, 5, 4, 6, 8, 5, 7],
    outreach: [1, 2, 1, 3, 2, 4, 3]
  }
  const lineSeries = [4, 6, 5, 7, 9, 8, 10]
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const partnershipWatch = [
    { name: "Glibatree", subs: "55k", focus: "Workflow Architect" },
    { name: "Theoretically Media", subs: "170k", focus: "Credibility / Tutorials" },
    { name: "Curious Refuge", subs: "240k", focus: "Festival + Creator" },
    { name: "Lenny Blomde", subs: "7k", focus: "Viral Tutorials" }
  ]
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
            <div className="bar-chart">{renderBars(activity.leads, "primary")}</div>
            <div className="chart-labels">
              {days.map((day) => (
                <span key={`leads-${day}`}>{day}</span>
              ))}
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-header">
              <span>Outreach touches</span>
              <strong>Last 7 days</strong>
            </div>
            <div className="bar-chart">{renderBars(activity.outreach, "secondary")}</div>
            <div className="chart-labels">
              {days.map((day) => (
                <span key={`outreach-${day}`}>{day}</span>
              ))}
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-header">
              <span>Momentum</span>
              <strong>Lead score trend</strong>
            </div>
            <div className="line-chart">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <polyline
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={renderLinePath(lineSeries)}
                />
              </svg>
            </div>
            <div className="chart-labels">
              {days.map((day) => (
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
          {partnershipWatch.map((channel) => (
            <div key={channel.name} className="watch-item">
              <div>
                <strong>{channel.name}</strong>
                <span className="muted">{channel.focus}</span>
              </div>
              <span className="pill">{channel.subs} subs</span>
            </div>
          ))}
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
              <circle className="pie-seg seg-one" cx="21" cy="21" r="15.915" />
              <circle className="pie-seg seg-two" cx="21" cy="21" r="15.915" />
              <circle className="pie-seg seg-three" cx="21" cy="21" r="15.915" />
            </svg>
          </div>
          <div className="pie-legend">
            <div>
              <span className="legend-swatch swatch-one"></span>
              YouTube
            </div>
            <div>
              <span className="legend-swatch swatch-two"></span>
              X (Twitter)
            </div>
            <div>
              <span className="legend-swatch swatch-three"></span>
              Web / Other
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
