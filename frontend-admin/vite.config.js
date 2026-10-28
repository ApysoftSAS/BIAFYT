import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Una única fuente de verdad para nombre / id / versión. Igual patrón que
// frontend-usuario / frontend-couch, pero esta app NO usa Capacitor, así
// que el nombre/id vienen de `app.config.json` en vez de
// `capacitor.config.json`.
const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));
const app = JSON.parse(readFileSync("./app.config.json", "utf-8"));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_NAME__: JSON.stringify(app.appName),
    __APP_SHORT_NAME__: JSON.stringify(pkg.displayShortName ?? app.appName),
    __APP_ID__: JSON.stringify(app.appId),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: "jsdom",
    globals: false,
  },
});
