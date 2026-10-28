import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Una única fuente de verdad para nombre / id / versión (mismo patrón que
// frontend-usuario y frontend-couch).
const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));
const capacitor = JSON.parse(readFileSync("./capacitor.config.json", "utf-8"));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_NAME__: JSON.stringify(capacitor.appName),
    __APP_SHORT_NAME__: JSON.stringify(pkg.displayShortName ?? capacitor.appName),
    __APP_ID__: JSON.stringify(capacitor.appId),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Vitest lee esta misma config (no hay vitest.config.js aparte). Solo
  // afecta a `npm run test`; `vite build`/`vite dev` ignoran esta clave.
  test: {
    environment: "jsdom",
    globals: false,
  },
});
