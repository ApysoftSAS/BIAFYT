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
import Workspace from "./screens/Workspace.jsx";
import Account from "./screens/Account.jsx";

const TABS = ["overview", "workspace", "account"];

function AuthChecking() {
  return (
    <div className="hero">
      <div className="brand-mark">
        <Glyph size={58} />
      </div>
      <h1 className="brand-title">{appConfig.name}</h1>
      <p className="brand-sub">Verificando sesión…</p>
    </div>
  );
}

function Shell() {
  const { auth, authChecking } = useSession();
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

  let content;
  if (screen === "workspace") content = <Workspace />;
  else if (screen === "account") content = <Account />;
  else content = <Overview />;

  const showNav = TABS.includes(screen);

  return (
    <div className={`app ${showNav ? "with-nav" : ""}`}>
      {content}
      {showNav && <BottomTabs current={screen} onNavigate={setScreen} />}
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
