import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Polyfill for PeerJS and WebRTC in production
if (typeof global === 'undefined') {
  (window as any).global = window;
}

createRoot(document.getElementById("root")!).render(<App />);
