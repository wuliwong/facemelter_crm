import React, { useEffect, useState } from "react"
import { apiRequest } from "./api"
import DashboardView from "./DashboardView"
import LeadsView from "./LeadsView"
import OrganizationView from "./OrganizationView"
import ProfileView from "./ProfileView"

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "leads", label: "Leads" },
  { key: "organization", label: "Organization" },
  { key: "profile", label: "Profile" }
]

const TAB_COPY = {
  leads: {
    title: "Leads",
    subtitle: "Find, qualify, and manage outreach from one workspace."
  },
  dashboard: {
    title: "Dashboard",
    subtitle: "A quick snapshot of your prospecting pipeline."
  },
  organization: {
    title: "Organization",
    subtitle: "Manage organization settings and member access."
  },
  profile: {
    title: "Profile",
    subtitle: "Manage your account and connected data sources."
  }
}

const TAB_ROUTES = {
  dashboard: "/",
  leads: "/leads",
  organization: "/organization",
  profile: "/profile"
}

const getTabFromLocation = () => {
  if (typeof window === "undefined") return "dashboard"
  const path = window.location.pathname
  if (path === "/" || path === "/dashboard") return "dashboard"
  const match = Object.entries(TAB_ROUTES).find(([, route]) => route === path)
  if (match) return match[0]
  return "dashboard"
}

const updateTabInUrl = (tab, method = "pushState") => {
  if (typeof window === "undefined") return
  const path = TAB_ROUTES[tab] || "/"
  if (window.location.pathname === path) return
  const url = new URL(window.location.href)
  url.pathname = path
  window.history[method]({}, "", url)
}

const assetFromMeta = (metaName, fallback) => {
  if (typeof document === "undefined") return fallback
  return document.querySelector(`meta[name="${metaName}"]`)?.content || fallback
}

export default function App() {
  const [activeTab, setActiveTab] = useState(getTabFromLocation)
  const [session, setSession] = useState({ loading: true, user: null, organization: null })
  const [leadSearch, setLeadSearch] = useState("")
  const brandIconSrc = assetFromMeta("asset-facemelter-icon", "/assets/facemelter_icon.jpeg")

  useEffect(() => {
    apiRequest("/api/me")
      .then((data) => {
        setSession({ loading: false, user: data.user, organization: data.organization })
      })
      .catch(() => {
        setSession((prev) => ({ ...prev, loading: false }))
      })
  }, [])

  useEffect(() => {
    const path = window.location.pathname
    const allowed = new Set([...Object.values(TAB_ROUTES), "/dashboard"])
    if (!allowed.has(path)) {
      updateTabInUrl("dashboard", "replaceState")
    }
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromLocation())
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey)
    updateTabInUrl(tabKey, "pushState")
  }

  const tabCopy = TAB_COPY[activeTab]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img
            className="brand-icon"
            src={brandIconSrc}
            alt="Facemelter icon"
          />
        </div>

        <nav className="side-nav">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`nav-item ${tab.key === activeTab ? "active" : ""}`}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {session.organization && <span>{session.organization.name}</span>}
          {session.user && <span>{session.user.email}</span>}
          <a className="signout" href="/users/sign_out" data-turbo-method="delete">
            Sign out
          </a>
        </div>
      </aside>

      <div className="app-content">
        <header className="topbar">
          <div>
            <p className="topbar-label">Workspace</p>
            <h2>{tabCopy.title}</h2>
            <p className="muted">{tabCopy.subtitle}</p>
          </div>
          <div className="topbar-actions">
            <input
              className="search"
              placeholder={activeTab === "leads" ? "Search leads by name" : "Search"}
              disabled={activeTab !== "leads"}
              value={activeTab === "leads" ? leadSearch : ""}
              onChange={(event) => setLeadSearch(event.target.value)}
              aria-label="Search leads"
            />
          </div>
        </header>

        {activeTab === "dashboard" && <DashboardView />}
        {activeTab === "leads" && <LeadsView searchTerm={leadSearch} />}
        {activeTab === "organization" && <OrganizationView />}
        {activeTab === "profile" && <ProfileView />}
      </div>
    </div>
  )
}
