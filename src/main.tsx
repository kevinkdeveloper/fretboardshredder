import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// ✅ Import styles so Vite bundles them (no <link> tags needed in HTML)
import "./styles.css";
import "./mobile-enhancements.css";
import "./mobile-enhancements.js"; // optional

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
