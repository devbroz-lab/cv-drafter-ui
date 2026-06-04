import { QueryClientProvider } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";
import { queryClient } from "./lib/queryClient";
import { initTheme } from "./lib/theme";

import "./styles/theme-tokens.css";
import "./styles/globals.css";
import "./styles/pipeline-status.css";
import "./styles/session-insights.css";
import "./styles/docx-viewer.css";
import "./styles/auth-page.css";
import "./styles/home-page.css";
import "./styles/new-session-flow.css";

initTheme();

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <GoogleOAuthProvider clientId={googleClientId || ""}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </GoogleOAuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
