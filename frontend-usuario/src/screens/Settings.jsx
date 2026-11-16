import { useCallback, useEffect, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Button, Card, Screen, Tabs, Toggle, Modal } from "../components/UI.jsx";
import { BASES, DEFAULT_THEME, INKS, PRESETS, sanitizeTheme } from "../theme/themes.js";
import { focuses } from "../data/training.js";
import { feedback } from "../utils/feedback.js";
import { detectProvider, enroll, describeAuthError } from "../utils/biometric.js";
import appConfig from "../config/appConfig.js";

export default function Settings({ onBack, onNavigate }) {
  const { state, actions } = useApp();
  const s = state.identity.settings;
  const d = state.device.settings;
  const [confirmReset, setConfirmReset] = useState(false);
  const theme = d.theme;
  // Solo colores: el vidrio cálido no es una opción (ver theme/themes.js).
  const setTheme = (next) => actions.updateDeviceSettings({ theme: sanitizeTheme({ ...theme, ...next }) });
  const themeTabs = [...Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label })), { id: "custom", label: "Personalizado" }];
  const [bio, setBio] = useState({ provider: null, label: "Huella o rostro", real: false });
  const [bioError, setBioError] = useState("");

  useEffect(() => {
    let alive = true;
    detectProvider().then((result) => {
      if (alive) setBio(result);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggleBiometric = useCallback(
    async (enable) => {
      setBioError("");
      if (!enable) {
        actions.setAuth({ biometric: { enabled: false, credentialId: null } });
        return;
      }
      try {
        const credentialId = await enroll({
          provider: bio.provider,
          userId: state.identity.user.id,
          userName: state.device.rememberedEmail ?? state.identity.user.name,
          appName: appConfig.name,
        });
        actions.setAuth({ biometric: { enabled: true, credentialId, provider: bio.provider } });
      } catch (e) {
        setBioError(describeAuthError(e));
      }
    },
    [actions, bio.provider, state.device.rememberedEmail, state.identity.user.id, state.identity.user.name]
  );

  return (
    <Screen title="CONFIGURACIÓN" onBack={onBack}>
      <div className="stack">
        {/* PRIVACIDAD (puntos 58, 89) */}
        <Card>
          <p className="micro">PRIVACIDAD</p>
          <Toggle
            label="Participar en clasificaciones"
            description="Permite que otros usuarios puedan verte en rankings y clasificaciones."
            checked={s.rankingOptIn}
            onChange={(v) => actions.updateIdentitySettings({ rankingOptIn: v })}
          />
          <Toggle
            label="Perfil público"
            description="Tu perfil puede consultarse antes de un duelo."
            checked={s.publicProfile}
            onChange={(v) => actions.updateIdentitySettings({ publicProfile: v })}
          />
          <Toggle
            label="Mostrar datos físicos"
            description="Edad, peso y altura visibles en comparaciones."
            checked={s.visibleData.physical}
            onChange={(v) => actions.updateIdentitySettings({ visibleData: { physical: v } })}
          />
          {!s.rankingOptIn && (
            <p className="micro text-warning">
              Con esta opción desactivada seguirás acumulando estadísticas privadas, pero no aparecerás en rankings ni en usuarios destacados.
            </p>
          )}
        </Card>

        {/* NOTIFICACIONES (puntos 72, 73) */}
        <Card>
          <p className="micro">NOTIFICACIONES</p>
          <Toggle
            label="Sonido"
            checked={d.sound}
            onChange={(v) => {
              actions.updateDeviceSettings({ sound: v });
              if (v) feedback("success", { sound: true, vibration: false });
            }}
          />
          <Toggle
            label="Vibración"
            checked={d.vibration}
            onChange={(v) => {
              actions.updateDeviceSettings({ vibration: v });
              if (v) feedback("success", { sound: false, vibration: true });
            }}
          />
          <div className="divider" />
          {[
            ["training", "Entrenamiento"],
            ["rankings", "Rankings"],
            ["challenges", "Challenges"],
            ["duels", "Duelos"],
            ["promos", "Promociones"],
          ].map(([key, label]) => (
            <Toggle
              key={key}
              label={label}
              checked={s.notifications[key]}
              onChange={(v) => actions.updateIdentitySettings({ notifications: { [key]: v } })}
            />
          ))}
        </Card>

        {/* ENTRENAMIENTO */}
        <Card>
          <p className="micro">ENTRENAMIENTO</p>
          <Toggle
            label="GPS para actividades competitivas"
            description="Necesario para que tus entrenamientos generen puntos de ranking y premios."
            checked={d.gpsCompetitive}
            onChange={(v) => actions.updateDeviceSettings({ gpsCompetitive: v })}
          />
          <div className="divider" />
          <p className="micro">ENFOQUE ACTUAL</p>
          <select className="input" value={state.identity.user.focusId} onChange={(e) => actions.updateUser({ focusId: e.target.value })}>
            {focuses.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Card>

        {/* APARIENCIA */}
        <Card>
          <p className="micro">APARIENCIA</p>
          <p className="muted">Elige tu paleta. El efecto de vidrio cálido es parte de BIAFYT y no se puede cambiar.</p>
          <Tabs items={themeTabs} value={theme.preset} onChange={(id) => setTheme({ preset: id })} />
          {theme.preset === "custom" && (
            <div className="stack-sm">
              <div className="row-between">
                <span className="toggle-label">Acento</span>
                <input
                  type="color"
                  className="color-input"
                  aria-label="Color de acento"
                  value={theme.accent}
                  onChange={(e) => setTheme({ preset: "custom", accent: e.target.value })}
                />
              </div>
              <div>
                <p className="micro">FONDO</p>
                <div className="swatch-row">
                  {BASES.map((b) => (
                    <button
                      key={b.value}
                      type="button"
                      className={`swatch ${theme.base === b.value ? "swatch-on" : ""}`}
                      style={{ "--sw": b.value }}
                      title={b.label}
                      aria-label={`Fondo ${b.label}`}
                      aria-pressed={theme.base === b.value}
                      onClick={() => setTheme({ preset: "custom", base: b.value })}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="micro">TINTA (ACTIVOS Y TARJETAS OSCURAS)</p>
                <div className="swatch-row">
                  {INKS.map((i) => (
                    <button
                      key={i.value}
                      type="button"
                      className={`swatch ${theme.ink === i.value ? "swatch-on" : ""}`}
                      style={{ "--sw": i.value }}
                      title={i.label}
                      aria-label={`Tinta ${i.label}`}
                      aria-pressed={theme.ink === i.value}
                      onClick={() => setTheme({ preset: "custom", ink: i.value })}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <Button variant="ghost" full onClick={() => setTheme(DEFAULT_THEME)}>
            RESTABLECER PALETA
          </Button>
        </Card>

        {/* CUENTA Y ACCESO */}
        <Card>
          <p className="micro">CUENTA</p>
          <p className="muted">{state.device.rememberedEmail ?? "Sesión local"}</p>
          <div className="divider" />
          <Toggle
            label={`Entrar con ${bio.label.toLowerCase()}`}
            description={bio.real ? "Acceso rápido sin escribir la contraseña." : "Simulado en navegador; real en Android e iOS."}
            checked={state.auth.biometric.enabled}
            onChange={toggleBiometric}
          />
          {bioError && <p className="micro text-warning">{bioError}</p>}
          <Button variant="ghost" full onClick={actions.signOut}>
            CERRAR SESIÓN
          </Button>
        </Card>

        {/* GIMNASIO */}
        <Card>
          <p className="micro">GIMNASIO</p>
          <Button variant="ghost" full onClick={() => onNavigate("changeGym")}>
            CAMBIAR GIMNASIO O SEDE
          </Button>
          <Button variant="ghost" full onClick={() => onNavigate("gymRegistration")}>
            REGISTRAR MI GIMNASIO
          </Button>
        </Card>

        <Card className="soft">
          <p className="micro">
            {appConfig.name} · versión {appConfig.version} · {appConfig.id}
          </p>
          <Button variant="danger" full onClick={() => setConfirmReset(true)}>
            REINICIAR DEMO
          </Button>
        </Card>
      </div>

      <Modal
        open={confirmReset}
        title="REINICIAR DEMO"
        onClose={() => setConfirmReset(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              CANCELAR
            </Button>
            <Button variant="danger" onClick={actions.resetAll}>
              REINICIAR
            </Button>
          </>
        }
      >
        <p className="muted">Se borrarán tus datos locales: perfil, puntos, duelos, premios y configuración.</p>
      </Modal>
    </Screen>
  );
}
