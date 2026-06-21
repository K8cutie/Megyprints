import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { reportError } from "./lib/report";
import "./index.css";

// Global safety net for unhandled promise rejections (Megyprints lesson).
window.addEventListener("unhandledrejection", (e) => {
  reportError(e.reason, { kind: "unhandledrejection" });
});
window.addEventListener("error", (e) => {
  reportError(e.error ?? e.message, { kind: "error" });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
