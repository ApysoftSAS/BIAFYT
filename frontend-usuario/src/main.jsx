import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import appConfig from "./config/appConfig.js";

// Punto 93: el título del documento también sale de la configuración.
document.title = appConfig.name;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
