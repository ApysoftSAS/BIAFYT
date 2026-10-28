# BIAFYT

Carve. Refine. Become.
Aplicación de entrenamiento, validación y competencia.
React 19 + Vite 8 + Capacitor (**Android e iOS**).

## Identidad visual

| Token | Valor | Uso |
|---|---|---|
| Profundo | `#112B32` | Fondo y base |
| Claro | `#DCEFED` | Texto y tarjetas claras |
| Turquesa | `#65CDBD` | Acento, CTA, estados activos |

Tipografía **Outfit** (pesos 200–800), con tracking amplio en la marca.
Todo vive en `src/theme/colors.js`; ningún componente escribe hexadecimales.

### Liquid glass

Las superficies flotantes (tarjetas, navegación, modales, burbuja del coach)
usan la clase `.glass` o heredan de `.card`: fondo translúcido,
`backdrop-filter` con desenfoque y saturación, borde de luz superior y sombra
profunda. Los tokens están en `tokens.glassBlur`, `glassShadow`, `glassInner`
y `glowRing`.

---

## Ejecutar

```bash
npm install
npm run dev      # desarrollo
npm run build    # producción → dist/
npm run lint     # ESLint
```

### Android

```bash
npm run build
npx cap sync android
npx cap open android
```

### iOS (requiere macOS con Xcode)

```bash
npm run build
npx cap add ios          # solo la primera vez
npx cap sync ios
npx cap open ios
```

---

## Arquitectura

```
src/
├── theme/colors.js          Identidad visual centralizada (punto 92)
├── config/appConfig.js      Nombre / id / versión desde package (punto 93)
├── data/
│   ├── gyms.js              Gimnasios, sedes, estados de prospecto
│   ├── users.js             Comunidad, rivales y equipos
│   ├── machines.js          Biblioteca de máquinas
│   ├── prizes.js            Premios digitales
│   └── training.js          Enfoques y generador de rutinas
├── utils/
│   ├── gps.js               Permiso, posición y cercanía a la sede
│   ├── validation.js        Estados de actividad y economía de puntos
│   ├── duelEngine.js        Match score, probabilidad, modalidades, ganador
│   ├── feedback.js          Sonido (WebAudio) y vibración
│   └── format.js            Formato de tiempo, puntos y fechas
├── state/AppContext.jsx     Estado global + persistencia en LocalStorage
├── components/
│   ├── Coach.jsx            Avatar flotante contextual
│   ├── coachStates.js       Estados y mensajes del Coach
│   ├── MachineArt.jsx       Ilustraciones SVG propias de máquinas
│   ├── BottomNav.jsx        Navegación inferior
│   └── UI.jsx               Primitivas (Card, Button, Toggle, Modal…)
└── screens/                 Onboarding, Home, Workout, Ranking, Duels,
                             Machines, Prizes, Profile, Settings, ChangeGym
```

---

## Dos reglas de oro del proyecto

**1. Los colores no se escriben en los componentes.**
Todo sale de `src/theme/colors.js`, que se inyecta como variables CSS
(`--c-primary`, `--c-background`, …) al arrancar la app. Cambiar el amarillo
de KAIROS es editar una línea.

**2. El nombre de la app no se escribe en ningún componente.**
`vite.config.js` lee `package.json` y `capacitor.config.json` y expone
`appConfig.name`, `appConfig.id` y `appConfig.version`.

---

## Mapa de funcionalidades

| Bloque | Dónde vive |
|---|---|
| Asociación usuario → gimnasio → sede (54) | `screens/Onboarding.jsx`, `data/gyms.js` |
| Registro de gimnasio inexistente (55) | `screens/Onboarding.jsx` |
| Prospectos comerciales (56) | `state/AppContext.jsx` → `state.prospects` |
| Rankings por grupo/sede/gimnasio/ciudad/país/global (57) | `screens/Ranking.jsx`, `AppContext.ranking()` |
| Privacidad del ranking (58) | `screens/Settings.jsx` → `rankingOptIn` |
| GPS para puntos competitivos (59, 60, 88) | `utils/gps.js`, `screens/Workout.jsx` |
| Validación de tiempos (61) | `utils/validation.js` |
| Puntos de actividad vs competitivos (62, 91) | `utils/validation.js` |
| Premios digitales y regalo (63, 64) | `screens/Prizes.jsx`, `data/prizes.js` |
| Coach avatar, estados y descanso (65, 66, 67) | `components/Coach.jsx` |
| Biblioteca y ficha de máquinas (68, 69) | `screens/Machines.jsx` |
| Ilustraciones propias (70) | `components/MachineArt.jsx` |
| Enfoques de entrenamiento (71) | `data/training.js` |
| Notificaciones con sonido y vibración (72, 73) | `utils/feedback.js`, `AppContext.notify()` |
| Duelos completos (74–88) | `screens/Duels.jsx`, `utils/duelEngine.js` |
| Home y Perfil ampliados (94, 95) | `screens/Home.jsx`, `screens/Profile.jsx` |
| Configuración (96) | `screens/Settings.jsx` |
| Datos mock (97) | `src/data/` |

---

## Cómo validamos una actividad

`utils/validation.js` compara la duración real contra un mínimo físicamente
razonable (duración de serie + descanso + transición entre ejercicios) y
produce un estado:

| Estado | Significado |
|---|---|
| `VALID` | Todo coherente. Suma puntos de actividad y competitivos. |
| `SUSPICIOUS` | Datos poco habituales. Suma actividad, no competitivos. |
| `INVALID` | Tiempos imposibles o ubicación incorrecta. Solo queda registrada. |
| `PENDING` | Validación en curso. |

Los umbrales son deliberadamente tolerantes: el objetivo es detectar
comportamientos claramente anómalos, no castigar entrenamientos reales.

Comprobado con casos reales:

- Sesión de 40 min con 24 series → `VALID`, 276 puntos competitivos.
- 18 series registradas en 40 segundos → `INVALID`, 0 competitivos.
- Sesión real pero fuera del radio del gimnasio → `SUSPICIOUS`, 0 competitivos.

---

## Cómo se resuelve un duelo

1. Se elige rival del mismo gimnasio.
2. `estimateProbability()` compara fuerza **relativa al peso corporal**,
   resistencia, constancia y experiencia, más el historial de duelos.
   El resultado se acota entre 15% y 85% para no presentarlo como certeza.
3. Se elige modalidad y apuesta. El máximo es el menor entre tus puntos,
   los del rival y el techo de la modalidad.
4. Al aceptar, los puntos pasan a estado `BLOQUEADO`.
5. Ambos ejecutan la misma rutina con GPS.
6. `resolveDuel()` puntúa tiempo, ejercicios, repeticiones, consistencia y
   penalizaciones según los pesos configurables de la modalidad.
7. Si la actividad no se valida, el duelo queda `NO VALIDADO` y se devuelven
   los puntos bloqueados.

---

## Demo sin GPS real

En navegador de escritorio la geolocalización suele fallar o quedar lejos de
la sede. La pantalla previa al entrenamiento incluye
**SIMULAR UBICACIÓN EN LA SEDE**, que fuerza coordenadas válidas para poder
demostrar el flujo competitivo completo.

---

## Estado de la demo

Los datos viven en LocalStorage bajo la clave derivada del `appId`.
**Configuración → Reiniciar demo** borra todo y vuelve al onboarding.

Preparado pero no implementado como sistema completo: la gestión
administrativa de equipos (el modelo de datos ya existe en `data/users.js`) y
el panel B2B para gimnasios (la estructura de prospectos ya se guarda).

---

## Acceso y sesión

- **Registro / entrada** con correo y contraseña. La contraseña nunca se
  guarda en claro: se deriva con SHA-256 + salt aleatorio
  (`src/utils/auth.js`). **Esto es una demo sin backend**; en producción la
  verificación debe hacerse en el servidor con bcrypt o argon2.
- **Huella o rostro** vía WebAuthn con autenticador de plataforma. En Android
  resuelve el método que tenga configurado el dispositivo. Se activa desde la
  pantalla de acceso o en **Configuración → Cuenta**.
- WebAuthn exige **HTTPS o localhost**. En `npm run dev` (localhost) funciona;
  si sirves el build por HTTP plano en una IP de red, el navegador lo bloquea
  y la app cae automáticamente a correo + contraseña.

## Mis rutinas

`screens/MyRoutines.jsx`. El usuario crea rutinas propias con nombre, enfoque
y ejercicios (series, repeticiones y descanso por ejercicio), tomándolos de la
biblioteca de máquinas o escribiéndolos. La rutina marcada como **activa** es
la que se ejecuta en Entrenamiento y en los duelos. Si no hay ninguna activa,
se usa la rutina generada automáticamente desde el objetivo.

## Calendario y jornada

`screens/Calendar.jsx`. Vista mensual navegable que marca los días
entrenados, los planificados y los que el usuario definió como su jornada
habitual. Permite agendar sesiones, y configurar la franja horaria
(madrugada / mañana / tarde / noche), los días de la semana y el recordatorio.

## Retos diarios

`screens/Challenges.jsx`. Tres retos por día, elegidos de forma determinista
a partir de la fecha para que no cambien al recargar. El progreso se calcula
con la actividad real del día (check-in, series, minutos, sesiones validadas,
máquinas consultadas) y los puntos se cobran manualmente.

## Noticias y promociones

`screens/News.jsx` + `data/community.js`. Publicaciones del administrador del
gimnasio, con tipos noticia / promoción / evento, destacados, marca de no
leído y filtrado por gimnasio. La más reciente aparece como tarjeta en Home.
En producción vendrían del panel B2B.


---

## Coach flotante

`src/components/Coach.jsx`

- Se **arrastra a cualquier punto de la pantalla** con el dedo o el ratón
  (Pointer Events, idéntico en web, Android e iOS).
- Una **X pequeña** en la esquina lo cierra; queda un botón discreto abajo a
  la derecha para traerlo de vuelta.
- La posición y el estado cerrado se guardan y se recuperan al reabrir la app.
- Se distingue arrastre de toque con un umbral de 6 px: un toque corto sigue
  activando la acción del avatar.

## Biometría en las tres plataformas

`src/utils/biometric.js` detecta el contexto y resuelve el método:

| Contexto | Proveedor | Comportamiento |
|---|---|---|
| Android / iOS con Capacitor | Plugin nativo | Huella, Face ID o Touch ID reales |
| Navegador con HTTPS o localhost | WebAuthn | Autenticador de plataforma |
| Cualquier navegador (demo) | Simulado | Diálogo que deja pasar el flujo |

Para la biometría **real en nativo** hay que instalar el plugin:

```bash
npm install capacitor-native-biometric
npx cap sync
```

La capa ya lo detecta en `window.Capacitor.Plugins`; no hay que tocar código.
Sin el plugin, la app cae a WebAuthn o a la simulación sin romperse.
