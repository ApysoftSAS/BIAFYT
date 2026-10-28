/* eslint-disable react-refresh/only-export-components */
/**
 * BIAFYT — ARNÉS DE PRUEBAS PARA AppContext
 * ---------------------------------------------------------------
 * No usa @testing-library/react (evita una dependencia nueva): monta
 * <AppProvider> directamente con react-dom/client + `act` de "react"
 * (React 19) sobre un <div> de jsdom, y expone `state`/`actions`/etc. de
 * `useApp()` a través de un componente hijo que llama a `onUpdate` en
 * cada render. Solo para tests (`*.test.jsx`).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider, useApp } from "./AppContext.jsx";

function Capture({ onUpdate }) {
  const app = useApp();
  onUpdate(app);
  return null;
}

/** Monta <AppProvider> y devuelve { app, unmount() }. `app.state`/`app.actions` se refrescan tras cada `act()`. */
export function mountApp() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let app = null;

  act(() => {
    root.render(<AppProvider>{<Capture onUpdate={(next) => { app = next; }} />}</AppProvider>);
  });

  return {
    get app() {
      return app;
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** Ejecuta `fn` (puede ser async) dentro de `act()`, y espera a que termine. */
export async function actAsync(fn) {
  await act(async () => {
    await fn();
  });
}
