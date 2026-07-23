import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import DIApp from "./di/DIApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DIApp />
  </StrictMode>,
);
