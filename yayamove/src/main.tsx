import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Global safety net for unhandled promise rejections (Megyprints lesson).
window.addEventListener("unhandledrejection", (e) => {
  console.error("[Yayamove] Unhandled promise rejection:", e.reason);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
