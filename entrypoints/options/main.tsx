import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/app/App";
import "../../src/styles/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
