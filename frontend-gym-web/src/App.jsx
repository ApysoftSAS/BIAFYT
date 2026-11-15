import { useEffect, useState } from "react";
import "./App.css";
import { applyTheme } from "./theme/colors.js";
import { SessionProvider, useSession } from "./state/SessionContext.jsx";
import { Glyph } from "./components/Brand.jsx";
import appConfig from "./config/appConfig.js";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import Auth from "./screens/Auth.jsx";
import NoGymAccess from "./screens/NoGymAccess.jsx";
import Overview from "./screens/Overview.jsx";
import Workspace from "./screens/Workspace.jsx";
import Inventory from "./screens/Inventory.jsx";
import Branches from "./screens/Branches.jsx";
import Vouchers from "./screens/Vouchers.jsx";
import Reports from "./screens/Reports.jsx";
import { canOpen } from "./utils/gym.js";
import Account from "./screens/Account.jsx";

const SCREENS = ["overview", "reports", "workspace", "branches", "inventory", "vouchers", "account"];

function Hero({ subtitle }) {
  return (
    <div className="hero">
      <div>
        <div className="brand-mark" style={{ width: 76, height: 76, margin: "0 auto 12px", borderRadius: 22, display: "grid", placeItems: "center", background: "var(--c-surface-alt)", border: "1px solid var(--c-border-strong)" }}>
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
  const { auth, authChecking, gymAccess, activeRole } = useSession();
  const [screen, setScreen] = useState("overview");

  if (authChecking) return <Hero subtitle="Verificando sesión…" />;
  if (!auth.signedIn) return <Auth />;
  if (gymAccess.status === "loading") return <Hero subtitle="Cargando acceso…" />;
  if (gymAccess.status === "none") return <NoGymAccess />;

  const view = SCREENS.includes(screen) && canOpen(activeRole, screen) ? screen : "overview";
  let content;
  if (view === "workspace") content = <Workspace />;
  else if (view === "inventory") content = <Inventory />;
  else if (view === "branches") content = <Branches />;
  else if (view === "vouchers") content = <Vouchers />;
  else if (view === "reports") content = <Reports key={gymAccess.activeGymId} />;
  else if (view === "account") content = <Account />;
  else content = <Overview onNavigate={setScreen} />;

  return (
    <div className="gym-shell">
      <Sidebar current={view} onNavigate={setScreen} role={activeRole} />
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
