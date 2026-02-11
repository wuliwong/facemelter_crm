import React, { useEffect, useState } from "react"
import { apiRequest } from "./api"

export default function OrganizationView() {
  const [organization, setOrganization] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [name, setName] = useState("")

  const loadOrganization = () => {
    setLoading(true)
    apiRequest("/api/organization")
      .then((data) => {
        setOrganization(data.organization)
        setUsers(data.users || [])
        setName(data.organization?.name || "")
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
        body: { organization: { name } }
      })
      setOrganization(data.organization)
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
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
            <h2>Organization</h2>
            <p className="muted">Manage your studio identity and member access.</p>
          </div>
        </div>

        {loading && <p className="muted">Loading organization…</p>}
        {!loading && organization && (
          <form onSubmit={handleSaveName} className="form-inline">
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} />
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
