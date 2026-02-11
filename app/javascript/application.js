import "@hotwired/turbo-rails"
import React from "react"
import { createRoot } from "react-dom/client"
import App from "./components/App"

const mountReact = () => {
  const rootElement = document.getElementById("app")
  if (!rootElement) return

  const root = createRoot(rootElement)
  root.render(React.createElement(App))
}

const setupFlashDismiss = () => {
  document.querySelectorAll("[data-flash]").forEach((flash) => {
    const dismiss = flash.querySelector("[data-flash-dismiss]")
    if (!dismiss) return
    dismiss.addEventListener("click", () => flash.remove(), { once: true })
  })
}

document.addEventListener("turbo:load", () => {
  mountReact()
  setupFlashDismiss()
})
