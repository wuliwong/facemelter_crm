import React, { useEffect, useState } from "react"
import { apiRequest } from "./api"

const PROVIDERS = [
  { key: "x", label: "X (Twitter)", description: "Search and scrape posts from X" },
  { key: "linkedin", label: "LinkedIn", description: "Search and scrape posts from LinkedIn" }
]

export default function ProfileView() {
  const [user, setUser] = useState(null)
  const [organization, setOrganization] = useState(null)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [connections, setConnections] = useState({})
  const [launching, setLaunching] = useState({})

  useEffect(() => {
    apiRequest("/api/me")
      .then((data) => {
        setUser(data.user)
        setOrganization(data.organization)
        setName(data.user?.name || "")
      })
      .catch(setError)

    fetchConnections()
  }, [])

  const fetchConnections = () => {
    apiRequest("/api/connections")
      .then((data) => setConnections(data.connections || {}))
      .catch(() => {})
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const data = await apiRequest("/api/me", {
        method: "PATCH",
        body: { user: { name } }
      })
      setUser(data.user)
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  const handleLaunch = async (provider) => {
    setLaunching((prev) => ({ ...prev, [provider]: true }))
    try {
      await apiRequest(`/api/connections/${provider}/launch`, { method: "POST" })
    } catch (err) {
      setError(err)
    } finally {
      setLaunching((prev) => ({ ...prev, [provider]: false }))
    }
  }

  const handleDisconnect = async (provider) => {
    if (!confirm(`Disconnect ${provider}? This will clear your saved session.`)) return
    try {
      await apiRequest(`/api/connections/${provider}`, { method: "DELETE" })
      setConnections((prev) => ({ ...prev, [provider]: "disconnected" }))
    } catch (err) {
      setError(err)
    }
  }

  const handleRefreshStatus = () => {
    fetchConnections()
  }

  return (
    <div className="view-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Profile</h2>
            <p className="muted">Update your personal details.</p>
          </div>
        </div>

        {!user && <p className="muted">Loading profile…</p>}
        {user && (
          <form onSubmit={handleSave} className="form-inline">
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Email
              <input value={user.email} disabled />
            </label>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Organization</h2>
            <p className="muted">Current organization context.</p>
          </div>
        </div>
        {organization ? <p>{organization.name}</p> : <p className="muted">Loading…</p>}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Connected Accounts</h2>
            <p className="muted">
              Authenticate platforms for lead scraping. A browser window will open for you to log in.
            </p>
          </div>
          <button className="btn btn-sm ghost" type="button" onClick={handleRefreshStatus}>
            Refresh status
          </button>
        </div>

        <div className="connections-list">
          {PROVIDERS.map((provider) => {
            const status = connections[provider.key] || "disconnected"
            const isConnected = status === "connected"
            const isLaunching = launching[provider.key]

            return (
              <div key={provider.key} className="connection-row">
                <div className="connection-info">
                  <strong>{provider.label}</strong>
                  <span className="muted">{provider.description}</span>
                </div>
                <div className="connection-status">
                  <span className={`pill ${isConnected ? "pill-connected" : "pill-disconnected"}`}>
                    {isConnected ? "Connected" : "Not connected"}
                  </span>
                </div>
                <div className="connection-actions">
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => handleLaunch(provider.key)}
                    disabled={isLaunching}
                  >
                    {isLaunching
                      ? "Opening…"
                      : isConnected
                      ? "Re-authenticate"
                      : "Connect"}
                  </button>
                  {isConnected && (
                    <button
                      className="btn btn-sm ghost"
                      type="button"
                      onClick={() => handleDisconnect(provider.key)}
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <p className="muted" style={{ marginTop: 12 }}>
          A Chrome window will open. Log in, then close the browser. Click "Refresh status" to
          confirm.
        </p>
      </section>

      {error && (
        <div className="panel error">
          <p>Something went wrong. Check the console and try again.</p>
        </div>
      )}
    </div>
  )
}
