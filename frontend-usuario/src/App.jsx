import { useEffect, useMemo, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import "./App.css";
import { applyTheme } from "./theme/colors.js";
import { AppProvider, useApp } from "./state/AppContext.jsx";
import { Glyph } from "./components/Brand.jsx";
import appConfig from "./config/appConfig.js";
import AppBackground from "./components/AppBackground.jsx";
import BottomNav from "./components/BottomNav.jsx";
import Onboarding from "./screens/Onboarding.jsx";
import Home from "./screens/Home.jsx";
import Workout from "./screens/Workout.jsx";
import Ranking from "./screens/Ranking.jsx";
import Duels from "./screens/Duels.jsx";
import Machines from "./screens/Machines.jsx";
import Prizes from "./screens/Prizes.jsx";
import Profile from "./screens/Profile.jsx";
import Settings from "./screens/Settings.jsx";
import ChangeGym from "./screens/ChangeGym.jsx";
import RegisterMyGym from "./screens/RegisterMyGym.jsx";
import CoachRelationship from "./screens/CoachRelationship.jsx";
import EditProfile from "./screens/EditProfile.jsx";
import Auth from "./screens/Auth.jsx";
import BiometricLock from "./screens/BiometricLock.jsx";
import MyRoutines from "./screens/MyRoutines.jsx";
import Calendar from "./screens/Calendar.jsx";
import Challenges from "./screens/Challenges.jsx";
import News from "./screens/News.jsx";
import Videos from "./screens/Videos.jsx";
import Plans from "./screens/Plans.jsx";
import Analytics from "./screens/Analytics.jsx";
import { ACTIVITY_STATE } from "./utils/validation.js";
import { formatPoints } from "./utils/format.js";

const TABS = ["home", "ranking", "duels", "machines", "profile"];

/** Se muestra mientras se revalida el token persistido contra /me al arrancar, para no parpadear entre <Auth/> y la app. */
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
  const { state, me, actions, authChecking, duels } = useApp();
  const [screen, setScreen] = useState("home");
  const [duelWorkoutId, setDuelWorkoutId] = useState(null);
  const [focusDuelId, setFocusDuelId] = useState(null);

  // `screen` es estado local de este componente, no ligado a la identidad.
  // Si quedó apuntando a una pantalla de la sesión anterior en este mismo
  // dispositivo, un login que restaura una identidad ya onboarded (ver
  // AppContext#switchIdentity) aterrizaría directo en esa pantalla ajena en
  // vez de Home — el gate de `!state.identity.onboarded` no cubre este
  // caso porque esa identidad SÍ tiene onboarding propio. `user.id` solo
  // cambia cuando `applyMeResponse` aplica una identidad real distinta de
  // la que ya estaba activa: se usa como señal de "cambio de identidad"
  // para reiniciar la navegación a Home.
  const prevUserIdRef = useRef(state.identity.user.id);
  useEffect(() => {
    if (prevUserIdRef.current !== state.identity.user.id) {
      prevUserIdRef.current = state.identity.user.id;
      setScreen("home");
    }
  }, [state.identity.user.id]);

  // Badge de duelos: lo que requiere mi atención — retos recibidos sin
  // responder + duelos aceptados/en curso en los que aún no ejecuté.
  const pendingDuels = useMemo(
    () =>
      duels.list.filter(
        (d) =>
          (d.status === "pending" && d.viewer_role === "opponent") ||
          (["accepted", "in_progress"].includes(d.status) && !d.you_submitted)
      ).length,
    [duels.list]
  );

  // App Lock: al pasar a background, bloquea si hay sesión + biometría activa.
  // Al volver, Shell ya re-renderiza con auth.locked=true y muestra <BiometricLock/>.
  useEffect(() => {
    let handle;
    CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) actions.lockApp();
    }).then((h) => {
      handle = h;
    });
    return () => {
      handle?.remove();
    };
  }, [actions]);

  // Botón/gesto "Atrás" de Android: sin esto, @capacitor/app intercepta el evento
  // y no hace nada (no hay historial real que recorrer). Se mapea al mismo árbol
  // de onBack/onExit/setScreen que ya usa la navegación por toque.
  useEffect(() => {
    let handle;
    CapApp.addListener("backButton", () => {
      if (!state.auth.signedIn || state.auth.locked || !state.identity.onboarded) {
        CapApp.exitApp();
        return;
      }
      if (screen === "workout" || duelWorkoutId != null) {
        const inDuel = duelWorkoutId != null;
        setDuelWorkoutId(null);
        setScreen(inDuel ? "duels" : "home");
      } else if (screen === "settings") {
        setScreen("profile");
      } else if (screen === "changeGym") {
        setScreen("settings");
      } else if (screen === "gymRegistration") {
        setScreen("settings");
      } else if (screen === "coachRelationship") {
        setScreen("profile");
      } else if (screen === "editProfile") {
        setScreen("profile");
      } else if (["routines", "calendar", "challenges", "news", "prizes", "videos", "plans", "analytics"].includes(screen)) {
        setScreen("home");
      } else if (screen === "home") {
        CapApp.exitApp();
      } else if (TABS.includes(screen)) {
        setScreen("home");
      }
    }).then((h) => {
      handle = h;
    });
    return () => {
      handle?.remove();
    };
  }, [state.auth.signedIn, state.auth.locked, state.identity.onboarded, duelWorkoutId, screen]);

  // Mientras se revalida un token persistido contra /me, no se confía
  // aún en `signedIn` (ver AppContext#authChecking) — evita parpadear
  // entre <Auth/> y la app ya cargada al arrancar.
  if (authChecking) return <AuthChecking />;

  // Puerta de acceso: sin sesión iniciada no se entra a la app.
  if (!state.auth.signedIn) return <Auth />;
  if (state.auth.locked) return <BiometricLock />;
  if (!state.identity.onboarded) return <Onboarding />;

  // -----------------------------------------------------------------
  // EJECUCIÓN DEL DUELO (puntos 81, 84, 85, 88)
  // -----------------------------------------------------------------
  // El backend resuelve el ganador cuando AMBOS participantes han enviado
  // su ejecución (`DuelRules`, cara a cara). Aquí solo enviamos la propia y
  // notificamos según el estado que devuelva el backend; la conciliación de
  // la apuesta de puntos la hace `AppContext#reconcileDuels`. Punto 88: sin
  // validación GPS, el backend marca el duelo `unvalidated` y devuelve la
  // apuesta.
  const resolveDuelRun = (duelId, run, validation) => {
    const competitiveEligible = validation.competitiveEligible && validation.state === ACTIVITY_STATE.VALID;

    actions
      .submitDuelRun(duelId, { ...run, competitiveEligible })
      .then((duel) => {
        if (duel?.status === "unvalidated") {
          actions.notify({ channel: "duels", title: "DUELO NO VALIDADO", body: "Se devolvieron los puntos apostados.", tone: "alert" });
        } else if (duel?.status === "finished") {
          const draw = duel.winner_user_id == null;
          const won = duel.winner_user_id === me.id;
          actions.notify({
            channel: "duels",
            title: draw ? "Duelo en empate." : won ? "🏆 Ganaste tu duelo." : "El duelo terminó.",
            body: draw
              ? "Se devolvió tu apuesta."
              : won
                ? `+${formatPoints(duel.stake)} SOMA POINTS`
                : `−${formatPoints(duel.stake)} SOMA POINTS`,
            tone: won ? "success" : "alert",
          });
        } else {
          actions.notify({ channel: "duels", title: "Ejecución registrada.", body: "Esperando a que tu rival complete la rutina.", tone: "duel" });
        }
      })
      .catch(() => actions.notify({ channel: "duels", title: "No se pudo registrar tu ejecución.", body: "Inténtalo de nuevo.", tone: "alert" }));

    setDuelWorkoutId(null);
    setFocusDuelId(duelId);
    setScreen("duels");
  };

  // -----------------------------------------------------------------
  // RUTAS
  // -----------------------------------------------------------------
  const duelForWorkout = duels.list.find((d) => d.id === duelWorkoutId) || null;

  let content;
  if (screen === "workout" || duelForWorkout) {
    content = (
      <Workout
        duel={duelForWorkout}
        onExit={() => {
          setDuelWorkoutId(null);
          setScreen(duelForWorkout ? "duels" : "home");
        }}
        onDuelRun={(run, validation) => resolveDuelRun(duelForWorkout.id, run, validation)}
      />
    );
  } else if (screen === "settings") {
    content = <Settings onBack={() => setScreen("profile")} onNavigate={setScreen} />;
  } else if (screen === "changeGym") {
    content = <ChangeGym onBack={() => setScreen("settings")} />;
  } else if (screen === "gymRegistration") {
    content = <RegisterMyGym onBack={() => setScreen("settings")} />;
  } else if (screen === "coachRelationship") {
    content = <CoachRelationship onBack={() => setScreen("profile")} />;
  } else if (screen === "editProfile") {
    content = <EditProfile onBack={() => setScreen("profile")} />;
  } else if (screen === "routines") {
    content = <MyRoutines onBack={() => setScreen("home")} onTrain={() => setScreen("workout")} />;
  } else if (screen === "calendar") {
    content = <Calendar onBack={() => setScreen("home")} />;
  } else if (screen === "challenges") {
    content = <Challenges onBack={() => setScreen("home")} />;
  } else if (screen === "news") {
    content = <News onBack={() => setScreen("home")} />;
  } else if (screen === "prizes") {
    content = <Prizes onBack={() => setScreen("home")} />;
  } else if (screen === "videos") {
    content = <Videos onBack={() => setScreen("home")} />;
  } else if (screen === "plans") {
    content = <Plans onBack={() => setScreen("home")} />;
  } else if (screen === "analytics") {
    content = <Analytics onBack={() => setScreen("home")} onNavigate={setScreen} />;
  } else if (screen === "ranking") {
    content = <Ranking onNavigate={setScreen} />;
  } else if (screen === "duels") {
    content = (
      <Duels
        onStartDuelWorkout={(id) => setDuelWorkoutId(id)}
        focusDuelId={focusDuelId}
        onClearFocus={() => setFocusDuelId(null)}
      />
    );
  } else if (screen === "machines") {
    content = <Machines />;
  } else if (screen === "profile") {
    content = <Profile onNavigate={setScreen} />;
  } else {
    content = <Home onNavigate={setScreen} />;
  }

  const showNav = TABS.includes(screen) && !duelForWorkout && screen !== "workout";

  return (
    <div className={`app ${showNav ? "with-nav" : ""}`}>
      <AppBackground />
      {content}
      {showNav && <BottomNav current={screen} onNavigate={setScreen} duelBadge={pendingDuels} />}
    </div>
  );
}

export default function App() {
  useEffect(() => {
    applyTheme();
  }, []);

  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
