import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StrictMode } from "react";

export function renderRoute(path: string, url: string, element: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode><QueryClientProvider client={qc}><MemoryRouter initialEntries={[url]}>
      <Routes><Route path={path} element={element} /></Routes>
    </MemoryRouter></QueryClientProvider></StrictMode>
  );
}
