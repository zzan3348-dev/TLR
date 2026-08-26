import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { AuthProvider } from "./auth/AuthProvider";
import { SuperEventQueueProvider } from "./features/events/SuperEventQueueProvider";
import { EventEffectProvider } from "./features/effects/EventEffectProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <EventEffectProvider>
        <SuperEventQueueProvider>
          <App />
        </SuperEventQueueProvider>
      </EventEffectProvider>
    </AuthProvider>
  </StrictMode>,
);
