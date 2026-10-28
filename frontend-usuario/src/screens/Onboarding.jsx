import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { searchGyms, findGym } from "../data/gyms.js";
import { focuses } from "../data/training.js";
import { Button, Card, Field, Input, Badge, Screen } from "../components/UI.jsx";
import Coach from "../components/Coach.jsx";
import { initialsOf } from "../utils/format.js";
import { translateProfileError } from "../utils/api.js";
import appConfig from "../config/appConfig.js";
import { Glyph } from "../components/Brand.jsx";

const STEPS = ["welcome", "profile", "gym", "branch", "registerGym", "focus", "done"];

const toFieldString = (value) => (value === null || value === undefined ? "" : String(value));

export default function Onboarding() {
  const { state, actions } = useApp();
  const [step, setStep] = useState("welcome");
  // Perfil real confirmado por el backend (re-onboarding) → se puede prellenar.
  // Cualquier otro caso (cuenta nueva, seed legacy) arranca vacío: nunca se
  // muestra el seed mock como si fuera un dato físico real.
  const [form, setForm] = useState({
    name: state.identity.user.name,
    email: "",
    age: state.identity.user.profileSynced ? toFieldString(state.identity.user.profile?.age) : "",
    weight: state.identity.user.profileSynced ? toFieldString(state.identity.user.profile?.weight) : "",
    height: state.identity.user.profileSynced ? toFieldString(state.identity.user.profile?.height) : "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [query, setQuery] = useState("");
  const [pickedGymId, setPickedGymId] = useState(null);
  const [focusId, setFocusId] = useState(state.identity.user.focusId);
  // Valor de focusId con el que se "abrió" el paso focus — referencia
  // estable para el diff de guardado, mismo patrón que EditProfile.jsx.
  const [initialFocusId, setInitialFocusId] = useState(state.identity.user.focusId);
  // Campos que el usuario ya tocó a mano: una hidratación tardía del
  // backend (fetchProfile resolviendo después del montaje, ver efecto de
  // abajo) nunca debe pisar lo que el usuario ya escribió o eligió.
  const touched = useRef({ age: false, weight: false, height: false, focus: false });

  // Hidratación diferida (re-onboarding): si hay sesión, intenta traer el
  // Profile real del backend para no mostrar los defaults locales
  // (focusId "hypertrophy", campos físicos vacíos) cuando ya existe un
  // valor real. No bloquea la navegación del onboarding: si tarda o
  // falla (red/backend caído), el flujo sigue siendo usable con los
  // valores locales por defecto, igual que el PATCH final más abajo.
  useEffect(() => {
    if (state.auth.token) actions.fetchProfile();
    // Solo debe dispararse una vez, al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si el fetch diferido de arriba confirma un Profile real DESPUÉS del
  // montaje, y el usuario aún no tocó el campo/la tarjeta correspondiente,
  // se adopta como valor inicial real — nunca se pierde un dato físico u
  // objetivo ya existente en el backend a favor del default local.
  useEffect(() => {
    if (!state.identity.user.profileSynced) return;
    const profile = state.identity.user.profile;
    setForm((f) => ({
      ...f,
      age: touched.current.age ? f.age : toFieldString(profile?.age),
      weight: touched.current.weight ? f.weight : toFieldString(profile?.weight),
      height: touched.current.height ? f.height : toFieldString(profile?.height),
    }));
    if (!touched.current.focus) {
      setFocusId(state.identity.user.focusId);
      setInitialFocusId(state.identity.user.focusId);
    }
  }, [state.identity.user.profileSynced, state.identity.user.profile, state.identity.user.focusId]);

  const [gymForm, setGymForm] = useState({
    country: "Colombia",
    city: "",
    name: "",
    address: "",
    phone: "",
    branchName: "",
    website: "",
    instagram: "",
    notes: "",
  });

  const results = useMemo(() => searchGyms(state.device.gyms, query), [state.device.gyms, query]);
  const pickedGym = findGym(state.device.gyms, pickedGymId);

  const go = (next) => setStep(next);

  // -------------------- PASO: BIENVENIDA --------------------
  if (step === "welcome") {
    return (
      <div className="onboarding onboarding-hero">
        <div className="brand-mark">
        <Glyph size={58} />
      </div>
        <h1 className="brand-title">{appConfig.name}</h1>
        <p className="brand-sub">Carve. Refine. Become.</p>
        <Button full onClick={() => go("profile")}>
          COMENZAR
        </Button>
        <p className="micro">v{appConfig.version}</p>
        <Coach state="motivacion" message="Vamos a configurar tu perfil. Toma un minuto." />
      </div>
    );
  }

  // -------------------- PASO: PERFIL --------------------
  if (step === "profile") {
    const valid = form.name.trim().length > 2;
    return (
      <Screen title="TU PERFIL" subtitle="Necesitamos lo básico para armar tu rutina." onBack={() => go("welcome")}>
        <div className="stack">
          <Field label="Nombre completo">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tu nombre" />
          </Field>
          <Field label="Correo (opcional)">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="tu@correo.com" />
          </Field>
          <div className="grid-3">
            <Field label="Edad">
              <Input
                type="number"
                min="12"
                value={form.age}
                onChange={(e) => {
                  touched.current.age = true;
                  setForm({ ...form, age: e.target.value });
                }}
                placeholder="Opcional"
              />
            </Field>
            <Field label="Peso (kg)">
              <Input
                type="number"
                min="30"
                value={form.weight}
                onChange={(e) => {
                  touched.current.weight = true;
                  setForm({ ...form, weight: e.target.value });
                }}
                placeholder="Opcional"
              />
            </Field>
            <Field label="Altura (cm)">
              <Input
                type="number"
                min="120"
                value={form.height}
                onChange={(e) => {
                  touched.current.height = true;
                  setForm({ ...form, height: e.target.value });
                }}
                placeholder="Opcional"
              />
            </Field>
          </div>
          <Button
            full
            disabled={!valid}
            onClick={() => {
              // Optimista/local: solo se incluyen los campos que el usuario
              // efectivamente llenó, para no sobreescribir con vacío/0. El
              // PATCH real al backend ocurre más adelante, en focus→done.
              const physicalChanges = {};
              if (form.age.trim() !== "") physicalChanges.age = Number(form.age);
              if (form.weight.trim() !== "") physicalChanges.weight = Number(form.weight);
              if (form.height.trim() !== "") physicalChanges.height = Number(form.height);
              actions.updateUser({
                name: form.name,
                initials: initialsOf(form.name),
                email: form.email,
                profile: { ...state.identity.user.profile, ...physicalChanges },
              });
              go("gym");
            }}
          >
            CONTINUAR
          </Button>
        </div>
      </Screen>
    );
  }

  // -------------------- PASO: GIMNASIO (punto 54) --------------------
  if (step === "gym") {
    return (
      <Screen title="¿DÓNDE ENTRENAS?" subtitle="Busca tu gimnasio por nombre, ciudad o dirección." onBack={() => go("profile")}>
        <div className="stack">
          <Field label="Buscar mi gimnasio">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, ciudad o dirección…" />
          </Field>

          <div className="stack-sm">
            {results.map((g) => (
              <Card
                key={g.id}
                onClick={() => {
                  setPickedGymId(g.id);
                  if (g.branches.length === 1) {
                    actions.selectGym(g.id, g.branches[0].id);
                    go("focus");
                  } else {
                    go("branch");
                  }
                }}
              >
                <div className="row-between">
                  <div className="row-left">
                    <div className="gym-logo">{g.name.slice(0, 1)}</div>
                    <div>
                      <strong>{g.name}</strong>
                      <p className="muted">
                        {g.city} · {g.country}
                      </p>
                      <p className="micro">
                        {g.branches.length} {g.branches.length === 1 ? "sede" : "sedes"}
                      </p>
                    </div>
                  </div>
                  {!g.official && <Badge tone="warning">Prospecto</Badge>}
                </div>
              </Card>
            ))}
            {results.length === 0 && <p className="muted center">Sin resultados para “{query}”.</p>}
          </div>

          {/* Punto 55 */}
          <Card className="soft">
            <strong>¿No encuentras tu gimnasio?</strong>
            <p className="muted">Regístralo y podrás seguir usando la aplicación con normalidad.</p>
            <Button variant="ghost" full onClick={() => go("registerGym")}>
              REGISTRAR GIMNASIO
            </Button>
          </Card>
        </div>
      </Screen>
    );
  }

  // -------------------- PASO: SEDE --------------------
  if (step === "branch" && pickedGym) {
    return (
      <Screen title="SELECCIONA TU SEDE" subtitle={pickedGym.name} onBack={() => go("gym")}>
        <div className="stack-sm">
          {pickedGym.branches.map((b) => (
            <Card
              key={b.id}
              onClick={() => {
                actions.selectGym(pickedGym.id, b.id);
                go("focus");
              }}
            >
              <div className="row-between">
                <div>
                  <strong>
                    {pickedGym.name} — {b.name}
                  </strong>
                  <p className="muted">{b.address}</p>
                </div>
                <span className="chevron">›</span>
              </div>
            </Card>
          ))}
        </div>
      </Screen>
    );
  }

  // -------------------- PASO: REGISTRAR GIMNASIO (puntos 55, 56) --------------------
  if (step === "registerGym") {
    const valid = gymForm.name.trim() && gymForm.city.trim() && gymForm.address.trim();
    return (
      <Screen title="REGISTRAR GIMNASIO" subtitle="Lo agregaremos para que puedas entrenar desde ya." onBack={() => go("gym")}>
        <div className="stack">
          <div className="grid-2">
            <Field label="País">
              <Input value={gymForm.country} onChange={(e) => setGymForm({ ...gymForm, country: e.target.value })} />
            </Field>
            <Field label="Ciudad">
              <Input value={gymForm.city} onChange={(e) => setGymForm({ ...gymForm, city: e.target.value })} />
            </Field>
          </div>
          <Field label="Nombre del gimnasio">
            <Input value={gymForm.name} onChange={(e) => setGymForm({ ...gymForm, name: e.target.value })} />
          </Field>
          <Field label="Dirección">
            <Input value={gymForm.address} onChange={(e) => setGymForm({ ...gymForm, address: e.target.value })} />
          </Field>
          <div className="grid-2">
            <Field label="Número de contacto">
              <Input value={gymForm.phone} onChange={(e) => setGymForm({ ...gymForm, phone: e.target.value })} />
            </Field>
            <Field label="Nombre de la sede">
              <Input value={gymForm.branchName} onChange={(e) => setGymForm({ ...gymForm, branchName: e.target.value })} placeholder="Principal" />
            </Field>
          </div>
          <details className="details">
            <summary>Información opcional</summary>
            <div className="stack-sm">
              <Field label="Sitio web">
                <Input value={gymForm.website} onChange={(e) => setGymForm({ ...gymForm, website: e.target.value })} />
              </Field>
              <Field label="Instagram">
                <Input value={gymForm.instagram} onChange={(e) => setGymForm({ ...gymForm, instagram: e.target.value })} />
              </Field>
              <Field label="Información adicional">
                <Input value={gymForm.notes} onChange={(e) => setGymForm({ ...gymForm, notes: e.target.value })} />
              </Field>
            </div>
          </details>

          <Button
            full
            disabled={!valid}
            onClick={() => {
              const { gymId, branchId } = actions.registerGym(gymForm);
              actions.selectGym(gymId, branchId);
              actions.notify({
                channel: "training",
                title: "Gracias. Hemos registrado tu gimnasio.",
                body: "Nuestro equipo lo revisará para activarlo oficialmente.",
                tone: "success",
              });
              go("focus");
            }}
          >
            REGISTRAR
          </Button>
          <p className="micro">Guardamos estos datos para poder contactar al gimnasio más adelante.</p>
        </div>
      </Screen>
    );
  }

  // -------------------- PASO: ENFOQUE (punto 71) --------------------
  if (step === "focus") {
    return (
      <Screen title="TU OBJETIVO" subtitle="Con esto armamos tu rutina personalizada." onBack={() => go("gym")}>
        <div className="stack-sm">
          {focuses.map((f) => (
            <Card
              key={f.id}
              onClick={() => {
                touched.current.focus = true;
                setFocusId(f.id);
              }}
              className={focusId === f.id ? "card-selected" : ""}
            >
              <div className="row-between">
                <div>
                  <strong>{f.label}</strong>
                  <p className="muted">{f.hint}</p>
                </div>
                <span className={`radio ${focusId === f.id ? "radio-on" : ""}`} />
              </div>
            </Card>
          ))}
          <Button
            full
            disabled={savingProfile}
            onClick={async () => {
              actions.updateUser({ focusId }); // optimista, igual que hoy
              // Único PATCH de Profile en todo el onboarding: mismo patrón de
              // diff que EditProfile.jsx — focusId solo se incluye si cambió
              // respecto al valor con el que se abrió este paso (nunca se
              // reenvía el default local por encima de un focus_id real ya
              // guardado en el backend que el usuario nunca tocó). age/weight/
              // height siguen incluyéndose solo si el usuario los llenó. Un
              // fallo aquí NO bloquea la navegación: el usuario entra a la app
              // igual y podrá completarlo luego desde Editar perfil.
              const changes = {};
              if (focusId !== initialFocusId) changes.focusId = focusId;
              if (form.age.trim() !== "") changes.age = Number(form.age);
              if (form.weight.trim() !== "") changes.weight = Number(form.weight);
              if (form.height.trim() !== "") changes.height = Number(form.height);

              if (Object.keys(changes).length === 0) {
                go("done");
                return;
              }

              setSavingProfile(true);
              try {
                await actions.updateProfile(changes);
              } catch (e) {
                actions.notify({
                  channel: "training",
                  title: "No pudimos guardar tu perfil",
                  body: translateProfileError(e, "Podrás completarlo luego desde tu perfil."),
                  tone: "alert",
                });
              } finally {
                setSavingProfile(false);
                go("done");
              }
            }}
          >
            {savingProfile ? "GUARDANDO…" : "CONTINUAR"}
          </Button>
        </div>
      </Screen>
    );
  }

  // -------------------- PASO: LISTO --------------------
  return (
    <div className="onboarding onboarding-hero">
      <div className="brand-mark">
        <Glyph size={58} />
      </div>
      <h1 className="brand-title">TODO LISTO</h1>
      <p className="brand-sub">Tu rutina personalizada está preparada.</p>
      <Button
        full
        onClick={() => {
          actions.completeOnboarding();
          actions.notify({ channel: "training", title: `Bienvenido a ${appConfig.name}`, body: "Haz check-in y comienza a sumar puntos.", tone: "success" });
        }}
      >
        ENTRAR
      </Button>
      <Coach state="celebracion" message="Todo listo. Vamos a entrenar." />
    </div>
  );
}

export { STEPS };
