const defaultHeaders = {
  Accept: "application/json"
}

const getCsrfToken = () => document.querySelector('meta[name="csrf-token"]')?.content

export async function apiRequest(path, options = {}) {
  const headers = {
    ...defaultHeaders,
    ...(options.headers || {})
  }

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json"
  }

  const csrfToken = getCsrfToken()
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken
  }

  const config = {
    credentials: "same-origin",
    ...options,
    headers
  }

  if (config.body && typeof config.body !== "string") {
    config.body = JSON.stringify(config.body)
  }

  const response = await fetch(path, config)
  const contentType = response.headers.get("content-type") || ""
  const data = contentType.includes("application/json") ? await response.json() : null

  if (!response.ok) {
    const error = new Error("Request failed")
    error.status = response.status
    error.data = data
    throw error
  }

  return data
}
