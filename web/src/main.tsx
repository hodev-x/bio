import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRoutes } from "./router";
import { AuthProvider } from "./hooks/useAuth";
import { ModeProvider } from "./mode/ModeContext";
import "@fontsource-variable/newsreader";
import "./styles/admin.css";
import "./styles/public.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ModeProvider>
            <AppRoutes />
          </ModeProvider>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
