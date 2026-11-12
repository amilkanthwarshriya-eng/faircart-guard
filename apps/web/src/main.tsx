import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./app/App";
import "./index.css";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
async function start() {
  if (import.meta.env.VITE_USE_MOCKS === "true") {
    const { worker } = await import("./mocks/browser");
    await worker.start({ onUnhandledRequest: "bypass" });
  }
  render();
}
const render = () => createRoot(document.getElementById("root")!).render(
  <React.StrictMode><QueryClientProvider client={qc}><App /></QueryClientProvider></React.StrictMode>
);
void start();
