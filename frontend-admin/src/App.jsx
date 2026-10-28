import { useEffect, useState } from "react";
import "./App.css";
import { applyTheme } from "./theme/colors.js";
import { SessionProvider, useSession } from "./state/SessionContext.jsx";
import { Glyph } from "./components/Brand.jsx";
import appConfig from "./config/appConfig.js";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import Auth from "./screens/Auth.jsx";
import NoAccess from "./screens/NoAccess.jsx";
import Requests from "./screens/Requests.jsx";
import Gyms from "./screens/Gyms.jsx";
import Promotions from "./screens/Promotions.jsx";
import EquipmentCatalog from "./screens/EquipmentCatalog.jsx";
import EquipmentRequests from "./screens/EquipmentRequests.jsx";
import Account from "./screens/Account.jsx";

const SCREENS = ["requests", "gyms", "promotions", "equipmentCatalog", "equipmentRequests", "account"];

function Hero({ subtitle }) {
  return (
    <div className="hero">
      <div>
        <div
          className="brand-mark"
          style={{ width: 76, height: 76, margin: "0 auto 12px", borderRadius: 22, display: "grid", placeItems: "center", background: "var(--c-surface-alt)", border: "1px solid var(--c-border-strong)" }}
        >
          <Glyph size={44} />
        </div>
        <h1 style={{ fontWeight: 300, letterSpacing: "0.16em" }}>{appConfig.name}</h1>
        <p className="brand-sub" style={{ color: "var(--c-primary)", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.18em" }}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function Shell() {
  const { auth, authChecking } = useSession();
  const [screen, setScreen] = useState("requests");

  if (authChecking) return <Hero subtitle="Verificando sesión…" />;
  if (!auth.signedIn) return <Auth />;
  if (!auth.isPlatformAdmin) return <NoAccess />;

  const view = SCREENS.includes(screen) ? screen : "requests";
  let content;
  if (view === "gyms") content = <Gyms />;
  else if (view === "promotions") content = <Promotions />;
  else if (view === "equipmentCatalog") content = <EquipmentCatalog />;
  else if (view === "equipmentRequests") content = <EquipmentRequests />;
  else if (view === "account") content = <Account />;
  else content = <Requests />;

  return (
    <div className="gym-shell">
      <Sidebar current={view} onNavigate={setScreen} />
      <Topbar screen={view} onNavigate={setScreen} />
      <main className="gym-main">{content}</main>
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
