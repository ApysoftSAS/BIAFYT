import { useEffect, useMemo, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import "./App.css";
import { applyTheme } from "./theme/colors.js";
import { CoachProvider, useCoach } from "./state/CoachContext.jsx";
import { Glyph } from "./components/Brand.jsx";
import appConfig from "./config/appConfig.js";
import AppBackground from "./components/AppBackground.jsx";
import BottomNav from "./components/BottomNav.jsx";
import Auth from "./screens/Auth.jsx";
import Home from "./screens/Home.jsx";
import Athletes from "./screens/Athletes.jsx";
import AthleteDetail from "./screens/AthleteDetail.jsx";
import RoutineBuilder from "./screens/RoutineBuilder.jsx";
import Profile from "./screens/Profile.jsx";
import { groupRelationships } from "./utils/relationships.js";

const TABS = ["home", "athletes", "profile"];

/** Se muestra mientras se revalida el token persistido contra /auth/me al arrancar. */
function AuthChecking() {
  return (
    <div className="onboarding onboarding-hero auth">
      <div className="brand-mark">
        <Glyph size={58} />
      </div>
      <h1 className="brand-title">{appConfig.name}</h1>
      <p className="brand-sub">Verificando sesión…</p>
    </div>
  );
}

function Shell() {
  const { auth, authChecking, relationships } = useCoach();
  const [screen, setScreen] = useState("home");
  // Atleta seleccionado para la pantalla de detalle ({ id, name }).
  const [athlete, setAthlete] = useState(null);
  // Rutina en edición para RoutineBuilder: objeto programa o null (nueva).
  const [editingProgram, setEditingProgram] = useState(null);

  const pendingReceived = useMemo(() => groupRelationships(relationships).pendingReceived.length, [relationships]);

  // Botón/gesto "Atrás" de Android: sin esto @capacitor/app intercepta el
  // evento y no hace nada. Se mapea al mismo setScreen que la navegación táctil.
  useEffect(() => {
    let handle;
    CapApp.addListener("backButton", () => {
      if (!auth.signedIn) {
        CapApp.exitApp();
        return;
      }
      if (screen === "home") CapApp.exitApp();
      else if (screen === "routineBuilder") setScreen("athleteDetail");
      else if (screen === "athleteDetail") setScreen("athletes");
      else setScreen("home");
    }).then((h) => {
      handle = h;
    });
    return () => {
      handle?.remove();
    };
  }, [auth.signedIn, screen]);

  if (authChecking) return <AuthChecking />;
  if (!auth.signedIn) return <Auth />;

  const openAthlete = (a) => {
    setAthlete(a);
    setScreen("athleteDetail");
  };

  const openRoutine = (program) => {
    setEditingProgram(program);
    setScreen("routineBuilder");
  };

  let content;
  if (screen === "athletes") {
    content = <Athletes onOpenAthlete={openAthlete} />;
  } else if (screen === "athleteDetail" && athlete) {
    content = (
      <AthleteDetail
        athlete={athlete}
        onBack={() => setScreen("athletes")}
        onOpenRoutine={openRoutine}
      />
    );
  } else if (screen === "routineBuilder" && athlete) {
    content = (
      <RoutineBuilder
        athlete={athlete}
        program={editingProgram}
        onBack={() => setScreen("athleteDetail")}
        onSaved={() => setScreen("athleteDetail")}
      />
    );
  } else if (screen === "profile") {
    content = <Profile />;
  } else {
    content = <Home onNavigate={setScreen} />;
  }

  const showNav = TABS.includes(screen);

  return (
    <div className={`app ${showNav ? "with-nav" : ""}`}>
      <AppBackground />
      {content}
      {showNav && <BottomNav current={screen} onNavigate={setScreen} athleteBadge={pendingReceived} />}
    </div>
  );
}

export default function App() {
  useEffect(() => {
    applyTheme();
  }, []);

  return (
    <CoachProvider>
      <Shell />
    </CoachProvider>
  );
}
