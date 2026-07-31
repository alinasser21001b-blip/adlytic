import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("ROOT_ELEMENT_NOT_FOUND");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (
  "serviceWorker" in navigator &&
  import.meta.env.PROD &&
  !navigator.webdriver
) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
} else if ("serviceWorker" in navigator && navigator.webdriver) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      void registration.unregister();
    }
  });
}
