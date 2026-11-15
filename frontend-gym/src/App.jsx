import { useEffect, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import "./App.css";
import { applyTheme } from "./theme/colors.js";
import { SessionProvider, useSession } from "./state/SessionContext.jsx";
import { Glyph } from "./components/Brand.jsx";
import appConfig from "./config/appConfig.js";
import BottomTabs from "./components/BottomTabs.jsx";
import Auth from "./screens/Auth.jsx";
import Overview from "./screens/Overview.jsx";
import NoGymAccess from "./screens/NoGymAccess.jsx";
import Workspace from "./screens/Workspace.jsx";
import Branches from "./screens/Branches.jsx";
import Inventory from "./screens/Inventory.jsx";
import Vouchers from "./screens/Vouchers.jsx";
import Reports from "./screens/Reports.jsx";
import { canOpen } from "./utils/gym.js";
import Account from "./screens/Account.jsx";

const TABS = ["overview", "reports", "workspace", "branches", "inventory", "vouchers", "account"];

function AuthChecking({ text = "Verificando sesión…" }) {
  return (
    <div className="hero">
      <div className="brand-mark">
        <Glyph size={58} />
      </div>
      <h1 className="brand-title">{appConfig.name}</h1>
      <p className="brand-sub">{text}</p>
    </div>
  );
}

function Shell() {
  const { auth, authChecking, gymAccess, activeRole } = useSession();
  const [screen, setScreen] = useState("overview");

  // Botón/gesto "Atrás" de Android: sin esto @capacitor/app intercepta el
  // evento y no hace nada. Mismo patrón que frontend-usuario / frontend-couch.
  useEffect(() => {
    let handle;
    CapApp.addListener("backButton", () => {
      if (!auth.signedIn || screen === "overview") {
        CapApp.exitApp();
        return;
      }
      setScreen("overview");
    }).then((h) => {
      handle = h;
    });
    return () => {
      handle?.remove();
    };
  }, [auth.signedIn, screen]);

  if (authChecking) return <AuthChecking />;
  if (!auth.signedIn) return <Auth />;
  // Mismo gate que Gym Web: solo un gym_admin activo entra a la gestión.
  if (gymAccess.status === "loading") return <AuthChecking text="Cargando acceso…" />;
  if (gymAccess.status === "none") return <NoGymAccess />;

  // Las pantallas de gestión son las de frontend-gym-web (sin <Screen>):
  // se envuelven en el contenedor móvil estándar.
  let content;
  // Un staff que llegue a una sección de admin (p. ej. estado previo) vuelve al Resumen.
  const view = canOpen(activeRole, screen) ? screen : "overview";
  if (view === "account") content = <Account />;
  else {
    let inner;
    if (view === "workspace") inner = <Workspace />;
    else if (view === "branches") inner = <Branches />;
    else if (view === "inventory") inner = <Inventory />;
    else if (view === "vouchers") inner = <Vouchers />;
    else if (view === "reports") inner = <Reports key={gymAccess.activeGymId} />;
    else inner = <Overview onNavigate={setScreen} />;
    content = (
      <div className="screen">
        <div className="screen-body gym-mobile-body">{inner}</div>
      </div>
    );
  }

  const showNav = TABS.includes(view);

  return (
    <div className={`app ${showNav ? "with-nav" : ""}`}>
      {content}
      {showNav && <BottomTabs current={view} onNavigate={setScreen} role={activeRole} />}
    </div>
  );
}

export default function App() {
  useEffect(() => {
    applyTheme();
  }, []);

  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
