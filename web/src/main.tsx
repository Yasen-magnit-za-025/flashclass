import "@fontsource-variable/inter";
import "./styles/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { SessionProvider } from "./app/session";
import { I18nProvider } from "./i18n/I18nProvider";
import { AppError } from "./lib/errors";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Don't retry authorization/validation errors; they won't fix themselves.
      retry: (failureCount, error) =>
        failureCount < 2 && !(error instanceof AppError && error.key !== "errors.network"),
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
