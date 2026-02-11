const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content

const defaultHeaders = {
  Accept: "application/json",
  "Content-Type": "application/json"
}

if (csrfToken) {
  defaultHeaders["X-CSRF-Token"] = csrfToken
}

export async function apiRequest(path, options = {}) {
  const config = {
    credentials: "same-origin",
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {})
    }
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
