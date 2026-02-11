import React, { useEffect, useState } from "react"
import { apiRequest } from "./api"

export default function ProfileView() {
  const [user, setUser] = useState(null)
  const [organization, setOrganization] = useState(null)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiRequest("/api/me")
      .then((data) => {
        setUser(data.user)
        setOrganization(data.organization)
        setName(data.user?.name || "")
      })
      .catch(setError)
  }, [])

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

      {error && (
        <div className="panel error">
          <p>Something went wrong. Check the console and try again.</p>
        </div>
      )}
    </div>
  )
}
