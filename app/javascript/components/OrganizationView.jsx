import React, { useEffect, useState } from "react"
import { apiRequest } from "./api"

export default function OrganizationView() {
  const [organization, setOrganization] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [name, setName] = useState("")
  const [overview, setOverview] = useState("")
  const [editingOrg, setEditingOrg] = useState(false)

  const loadOrganization = () => {
    setLoading(true)
    apiRequest("/api/organization")
      .then((data) => {
        setOrganization(data.organization)
        setUsers(data.users || [])
        setName(data.organization?.name || "")
        setOverview(data.organization?.overview || "")
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadOrganization()
  }, [])

  const handleSaveName = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const data = await apiRequest("/api/organization", {
        method: "PATCH",
        body: { organization: { name, overview } }
      })
      setOrganization(data.organization)
      setName(data.organization?.name || "")
      setOverview(data.organization?.overview || "")
      setEditingOrg(false)
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  const startEditOrganization = () => {
    setName(organization?.name || "")
    setOverview(organization?.overview || "")
    setEditingOrg(true)
  }

  const cancelEditOrganization = () => {
    setName(organization?.name || "")
    setOverview(organization?.overview || "")
    setEditingOrg(false)
  }

  const handleRoleChange = async (userId, role) => {
    try {
      const data = await apiRequest(`/api/users/${userId}`, {
        method: "PATCH",
        body: { user: { role } }
      })
      setUsers((prev) => prev.map((user) => (user.id === userId ? data.user : user)))
    } catch (err) {
      setError(err)
    }
  }

  const handleRemoveUser = async (userId) => {
    if (!confirm("Remove this user from the organization?")) return

    try {
      await apiRequest(`/api/users/${userId}`, { method: "DELETE" })
      setUsers((prev) => prev.filter((user) => user.id !== userId))
    } catch (err) {
      setError(err)
    }
  }

  return (
    <div className="view-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Organization settings</h2>
            <p className="muted">Edit your organization name and AI context overview.</p>
          </div>
          {!loading && organization && !editingOrg && (
            <button className="btn btn-sm" type="button" onClick={startEditOrganization}>
              Edit organization
            </button>
          )}
        </div>

        {loading && <p className="muted">Loading organization…</p>}
        {!loading && organization && (
          <>
            {!editingOrg && (
              <div className="detail-grid">
                <div className="detail-notes">
                  <span className="label">Name</span>
                  <p>{organization.name || "—"}</p>
                </div>
                <div className="detail-notes">
                  <span className="label">Overview</span>
                  <p className="org-overview-text">
                    {organization.overview?.trim() || "No overview added yet."}
                  </p>
                </div>
              </div>
            )}

            {editingOrg && (
              <form onSubmit={handleSaveName} className="form-grid">
                <label>
                  Name
                  <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="span-2">
                  Overview
                  <textarea
                    value={overview}
                    onChange={(event) => setOverview(event.target.value)}
                    placeholder="Describe your business, offer, target customer, and positioning for AI workflows."
                  />
                </label>
                <div className="span-2 form-actions">
                  <button className="btn" type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button className="btn ghost" type="button" onClick={cancelEditOrganization}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Members</h2>
            <p className="muted">Admins can change roles or remove members.</p>
          </div>
        </div>

        {users.length === 0 && <p className="muted">No members yet.</p>}
        {users.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name || "—"}</td>
                  <td>{user.email}</td>
                  <td>
                    <select
                      value={user.role}
                      onChange={(event) => handleRoleChange(user.id, event.target.value)}
                    >
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </select>
                  </td>
                  <td>
                    <button className="btn ghost" onClick={() => handleRemoveUser(user.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
