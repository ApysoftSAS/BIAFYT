# CLAUDE.md — frontend-usuario

Guidance for the BIAFYT end-user app. One of three independent front-end
apps in the repo (see `../CLAUDE.md`); the backend is `../backend/` (Laravel).

## Project

BIAFYT end-user app — React 19 + Vite 8 fitness/gym training app, packaged
for Android and iOS via Capacitor 8 (`appId` `com.apysoft.gymprofit`).

State persists to LocalStorage under the key `${appConfig.id}.state.v1`
(`src/config/appConfig.js`) and, for signed-in users, is snapshotted per
backend `user.id` (`AppContext#switchIdentity`/`identitySnapshots`).

The Laravel backend (`VITE_API_BASE_URL` in `.env`, default
`http://localhost:8000/api/v1`) is authoritative **only for Auth and
Profile**. It also serves the exercise catalog (`GET /exercises`) and the
machine catalog (`GET /equipment`), each with an atomic/offline local
fallback (`data/exerciseCatalog.js`, `data/equipmentCatalog.js`). The
**visible streak** (`current_streak` / `longest_streak`) comes exclusively
from `GET /me/streak` (`StreakRules` over check-ins) — held in
`AppContext.streak` (in-memory, refreshed on sign-in + after each check-in),
no fallback to local values (shows "—" if the backend is unreachable).
Duels are the other exception: the duel STATE (real `User` participants,
acceptance, runs, winner) is backend-owned (`GET /me/duels` + `DuelController`,
roadmap 3b) — `AppContext.duels` (`{list, status}`, in-memory). Everything
else — points, training, check-in, challenges, rewards, calendar, ranking —
is LocalStorage-based; Activity, Check-in, Challenge, Reward and Duel
(`duel_won`/`duel_lost`) additionally send a **best-effort shadow copy** to
the backend (`utils/api.js`), but LocalStorage stays the visible source of
truth. There is no points-authority flip — the duel STAKE is still
reconciled in LocalStorage (`AppContext#reconcileDuels`; `identity.duels` is
now that per-duel `{id,stake,locked,settled}` reconciliation record, not the
duel list). `identity.user.streak` still lives in
LocalStorage but only as a session fact for the points path
(`buildActivityPayload` → `POST /me/activities`) until that flip. See
`../PROJECT_STATE.md` for the full state.

## Commands

```bash
npm install
npm run dev      # Vite dev server
npm run build    # production build → dist/
npm run lint     # ESLint (flat config, eslint.config.js)
npm run preview  # preview the production build
npm run test     # Vitest (jsdom) — run once, no watch
```

Tests: Vitest, ~15 `*.test.{js,jsx}` files under `src/` (state/AppContext,
utils/api, data/training, data/exerciseCatalog, screens/MyRoutines,
screens/Onboarding, and the write-through suites). Run the relevant ones for
a change; run `npm run test` for the full suite before closing a phase.

Package manager: **npm only**. `package-lock.json` is the single committed
lockfile (`yarn.lock` was removed in the Fase 2 prep). Do not use yarn/pnpm.

### Mobile

```bash
npm run build
npx cap sync android
npx cap open android

# iOS requires macOS + Xcode
npx cap add ios      # first time only
npx cap sync ios
npx cap open ios
```

## Architecture

- **Navigation**: no router library. `src/App.jsx`'s `Shell` component holds `screen` in `useState` and renders one of the `src/screens/*.jsx` components via an if/else chain; navigation is done by calling `setScreen(...)` passed down as `onNavigate`. `TABS` in `App.jsx` only decides whether the bottom nav is shown for the current screen — `BottomNav.jsx` keeps its own separate, hardcoded `items` array (id/label/icon) for what actually renders. The two lists are not linked: adding/removing a tab means updating both by hand.
- **Global state**: `src/state/AppContext.jsx` is the single source of truth (auth, user, gyms, duels, prospects, ranking opt-in, etc.), exposed via `AppProvider`/`useApp()`. It reads/writes LocalStorage directly. Server sync is limited: `auth`/`profile` are backed by the Laravel API (`utils/api.js`), and `addActivity`/`checkIn`/`checkOut`/`claimChallenge`/`claimPrize` fire a best-effort shadow `POST` when there is a token — a failed call is swallowed and never touches local state (no retry, no queue). The **visible streak** is the exception to "LocalStorage is the visible truth": `AppContext.streak` (`{current, longest, status}`, in-memory, not in `state`) is loaded from `GET /me/streak` on sign-in and refreshed after each check-in; the UI shows it directly (`Home`/`Profile`/`Challenges`) with `"—"` when unavailable — no fallback to `identity.user.streak`. The shape of `state` is an explicit hand-written allowlist in `src/state/stateSchema.js` (a static-shape test guards it); `device` survives an identity switch, `identity` is snapshotted per `user.id`.
- **Config injection point**: `vite.config.js` reads `package.json` and `capacitor.config.json` at build time and injects `__APP_NAME__`, `__APP_SHORT_NAME__`, `__APP_ID__`, `__APP_VERSION__` as global defines. `src/config/appConfig.js` is the only place these are consumed — app name/id/version must never be hardcoded elsewhere.
- **Theming**: `src/theme/colors.js` is the single source for color tokens; `applyTheme()` (called once in `App.jsx`) injects them as CSS variables (`--c-primary`, `--c-background`, ...) at startup. Components must not hardcode hex colors — they consume the CSS variables via the `.glass`/`.card` classes and related utility classes.
- **Global background ("David")**: `src/components/AppBackground.jsx` mounts a single fixed background image once, at the shell root (`App.jsx`, sibling of `{content}` inside `.app`) — never per-screen. CSS lives under `.app-bg`/`.app-bg-figure`/`.app-bg-tint`/`.app-bg-fade` in `App.css`. It's `position: fixed`, so it never moves with a screen's scroll and stays behind all screen content (`z-index: -1`); this requires `.app` to establish its own stacking context (`isolation: isolate`) — without that, the fixed layer paints behind `.app`'s own background and becomes invisible. `.screen.home` used to carry its own `overflow: hidden; isolation: isolate` for a now-removed local hero image; both were removed because they silently broke `position: sticky` on `.home-head` (it lost its scrolling ancestor) and trapped the notifications `Modal`'s stacking below `BottomNav`/`Coach`. Screens must not reintroduce `overflow`/`isolation` on their root element without checking this.
- **Mock data layer**: `src/data/*.js` (gyms, users/community, machines, prizes, plans/discount codes, training/routine generator, schedule, community/news, coaches, videos) stands in for a backend. Exception: `data/exercises.js` is the local fallback for a real endpoint — `data/exerciseCatalog.js#loadExerciseCatalog()` hydrates from `GET /api/v1/exercises` and accepts the remote catalog only if it matches the local one atomically, otherwise falls back to local. `data/users.js` already models team/admin structures not yet wired into a UI; `state/AppContext.jsx` already stores B2B "prospects" data not yet exposed in a full admin panel.
- **Coaches & Videos (TikTok integration — planned, not yet implemented)**: the "Videos" screen (`src/screens/Videos.jsx`, reached from Home's "ACCESOS" grid, not a bottom-nav tab) shows TikTok videos belonging to BIAFYT coaches. Today everything is mocked; there is no TikTok API call anywhere in the codebase yet. `src/data/coaches.js` models a coach the same way `communityUsers` models a person (`id`/`name`/`initials`/`gymId`) plus a `tiktok` sub-object standing in for the account a coach will connect via **TikTok Login Kit** (`user.info.basic`: `openId`/`displayName`/`avatarUrl`, `username` needs the extra `user.info.profile` scope). `src/data/videos.js` mirrors the real **TikTok Display API** (`video.list`/`video.query`) response shape under a `tiktok` key (`id`, `title`, `video_description`, `cover_image_url`, `embed_link`, `share_url`, `duration`, `create_time`, `like_count`, `comment_count`, `share_count`, `view_count`) so the mock can later be swapped for the real API response without reworking the UI. Each video also carries a separate `BIAFYT` key (`category`, `exerciseId`, `machineId`, `focusId`, all `null` today) for BIAFYT-only metadata (e.g. a future link to `data/training.js`'s `focuses` or `data/machines.js`) — **never mix these two objects**: anything under `tiktok` must be a field TikTok's API actually documents; anything BIAFYT infers or curates belongs under `BIAFYT`. Playback is not implemented — `src/utils/tiktok.js#tiktokPlayerUrl()` only builds the `https://www.tiktok.com/player/v1/{id}` URL for the future **TikTok Embed Player**; videos are never downloaded or stored. `Videos.jsx` reuses the existing `Card`/`Avatar`/`Field`/`Input`/`Tabs` components — the only new CSS is `.video-frame` (thumbnail/play placeholder, built from existing design tokens only). Filters are limited to what mock data actually supports: "Todos"/per-coach tabs (real — which TikTok account a video came from) and a title/description text search (real fields); there are no fitness-category filters (fuerza/cardio/músculo/máquina/ejercicio) because neither TikTok nor the current mock provide that data.
- **Machines library**: the source of truth is the **backend** `equipment` table (`GET /api/v1/equipment`, public, active items only), carrying the full educational shape (purpose, `primary_muscle`, `secondary_muscles`, movement, level, tips, mistakes, related, `art`). `src/data/equipmentCatalog.js#loadEquipmentCatalog()` hydrates it into `state.machineCatalog` (same pattern as `exerciseCatalog.js`), and `src/data/machines.js` is now **only the offline fallback** — used verbatim if the API fails or returns an invalid shape, never merged with remote data. `machines.js` must stay 1:1 with `backend/database/seeders/EquipmentSeeder.php`. Consumers: `screens/Machines.jsx` (`useApp().machineCatalog`) and `utils/analytics.js` (`routineMuscleGroups(exercises, machineCatalog)` — the `machineCatalog` arg is threaded from `Analytics.jsx`; it defaults to the local fallback for context-less callers). Each entry's `art` key still resolves to a shared SVG in `src/components/MachineArt.jsx` (presentation only; an unknown `art` falls back to a default drawing). Same `slug` space (`m-press-pecho`, ...) as `exercises.machine_id` and gym inventories.
- **Training/routine generation**: `src/data/training.js` — `buildRoutine(focusId)` is a fixed per-focus lookup, not an adaptive algorithm: `focuses` lists 8 training goals (`hypertrophy`, `strength`, `endurance`, `maintenance`, `fatloss`, `fitness`, `mobility`, `performance`), each mapped to a hardcoded `{ sets, reps, rest }` template and a canned exercise-name catalog; it does not take load/RPE/progression/experience-level into account. This is the same `focusId` id space that `videos.js`'s BIAFYT-only metadata (`BIAFYT.focusId`) is meant to link into later.
- **Coach routines & gym-aware picker (Fase 5, `screens/MyRoutines.jsx`)**: `customRoutines` (LocalStorage) stays the sole source of truth for the athlete's own routines — no migration, no gym/coach gate, independent flow unchanged. Two additive integrations: (a) a "DE MI COACH" section reads `GET /me/programs` and shows the programs with a non-null `created_by` **and a null `imported_at`**; "COPIAR A MIS RUTINAS" first calls `POST /me/programs/{id}/import` (persistent per-athlete flag on `programs.imported_at` — the coach's original is never deleted, the routine never comes back on reload or after the coach edits it) and only then flattens the program (days → one list) into a new `customRoutine`. (b) the exercise picker calls `GET /me/gym-assignments` + `GET /gyms/{id}/equipment` purely to sort gym-available exercises first and badge them "Disponible en tu gym" — it never touches the mock `gymId` used by check-in/GPS/onboarding, and never hides or blocks any exercise. Both fail silently (best-effort) and no-op without a token / backend gym.
- **Duels (real, roadmap 3b)**: the duel domain is backend-owned. `screens/Duels.jsx` reads `AppContext.duels.list` (from `GET /me/duels`) and challenges real gym-mates from `GET /me/duels/opponents` — no `data/users.js`. A duel is asynchronous 1v1: challenger creates → opponent accepts → both run the SAME routine and submit (`apiSubmitDuelRun`) → the backend resolves the winner head-to-head (`App\Support\DuelRules`). Modality names/descriptions in `Duels.jsx` are display-only; weights + scoring live in the backend. `AppContext` actions: `createDuel`/`acceptDuel`/`rejectDuel`/`cancelDuel`/`submitDuelRun`/`refreshDuels`. The visible points STAKE is locked (`lockPoints`) on create/accept and settled once by `reconcileDuels` when the backend marks the duel terminal (win → +stake net, lose → −stake, draw/unvalidated/rejected/cancelled → full refund); `identity.user.duels.{wins,losses}` only on decisive results. `src/utils/duelEngine.js` is the **old mock** (probability/simulation/self-referential scoring) — no production consumer, kept only for its own test, pending cleanup.
- **Activity validation**: `src/utils/validation.js` compares real workout duration against a physically-reasonable minimum (sets + rest + transition time) and returns one of `ACTIVITY_STATE`: `VALID`, `SUSPICIOUS`, `INVALID`, `PENDING`. Only `VALID` grants competitive points; thresholds are intentionally lenient (flag clear anomalies, not real workouts).
- **GPS**: `src/utils/gps.js` handles permission/position/proximity-to-gym for competitive points. Because desktop-browser geolocation is unreliable, the pre-workout screen offers "SIMULAR UBICACIÓN EN LA SEDE" to force valid coordinates for demoing the flow.
- **Auth & biometrics**:
  - Real auth is the Laravel backend (Sanctum bearer tokens) via `src/utils/api.js` + `AppContext` (`registerRemote`/`loginRemote`/`refreshSession`/`signOut`). Invariant: `auth.signedIn` is never true without a real `auth.token`; a persisted token is revalidated against `GET /auth/me` on startup.
  - `src/utils/auth.js`: client-side form validation (`validateEmail`, `passwordIssues`) plus the WebAuthn platform-authenticator helpers (`biometricAvailable`, `enrollBiometric`, `verifyBiometric`). It does not store or compare passwords locally.
  - `src/utils/biometric.js`: resolves biometric method by context — native Capacitor plugin (`capacitor-native-biometric`, if installed — checked via `window.Capacitor.Plugins`) on Android/iOS, WebAuthn on HTTPS/localhost browsers, otherwise a simulated pass-through dialog. WebAuthn requires HTTPS or localhost; plain HTTP on a LAN IP falls back to email/password automatically.
- **Feedback**: `src/utils/feedback.js` provides WebAudio sound + vibration, used via `AppContext.notify()`.
- **Coach widget**: `src/components/Coach.jsx` + `coachStates.js` — a draggable (Pointer Events) floating AI-assistant avatar; drag vs. tap is disambiguated with a 6px threshold; position/closed-state persist across sessions. Naming collision to keep in mind: this "Coach" (singular, the floating widget) is unrelated to the "coaches" (plural, gym trainers) modeled in `data/coaches.js` for the Videos feature.
- **Navigation entries beyond the bottom nav**: `routines`, `calendar`, `challenges`, `news`, `prizes`, `videos`, `plans`, `analytics` are all reached the same way — a `Card` in Home's "ACCESOS" grid (or another screen) calls `onNavigate("<screen>")`; `App.jsx`'s `Shell` routes it via the if/else chain in "RUTAS" and its hardware-back-button array (`["routines", "calendar", "challenges", "news", "prizes", "videos", "plans", "analytics"]`) sends the user back to Home. None of these are bottom-nav tabs (`TABS` stays `["home", "ranking", "duels", "machines", "profile"]`) — adding a new one means updating both the `Shell` if/else chain and that back-button array, not `BottomNav.jsx`.

## Claude Code workflow (skills, agents, rules)

This repo has a project-local Claude Code setup under `.claude/` — prefer it over ad-hoc analysis:

- **Skills** (`.claude/skills/*/SKILL.md`): `investigate` (understand a feature/bug before touching code), `implement` (make an approved change with minimal scope + verification), `code-review`, `architecture-review`, `fitness-review`, `ui-review`. Backend-focused: `api-review`, `backend-review`, `database-review`.
- **Agents** (`.claude/agents/*.md`): `architect`, `fitness-engineer`, `frontend-engineer`, `backend-engineer`, `qa-engineer`, `reviewer`.
- **Rules** (`.claude/rules/*.md`): `architecture.md`, `frontend.md`, `fitness.md`, `ux.md` — durable constraints (smallest-change bias, don't duplicate sources of truth, real fitness programming, mobile-first/reuse existing patterns, etc.) that apply regardless of which skill/agent is used.

Don't create new skills/agents/rules for a one-off task — use what's already here.

## Conventions

- Colors: always go through `src/theme/colors.js` / the injected CSS variables — never hardcode hex values in components.
- App identity (name/id/version): always go through `src/config/appConfig.js` — never hardcode the app name/id/version in components.
- UI text/comments in this codebase are in Spanish; match that when editing existing files.
- Reuse existing UI before adding new visual components: `src/components/UI.jsx` (`Card`, `Screen`, `Button`, `Field`/`Input`, `Tabs`, `Toggle`, `Bar`, `Avatar`, `Badge`, `Modal`, `EmptyState`, `Stat`) covers most screen needs. Extend an existing `Card`/pattern with more content before proposing a new visual component or design; a genuinely new visual pattern is a decision to flag, not to make silently.
- When modeling data from a third-party API (e.g. TikTok) before the real integration exists: mock the *actual* documented response shape, not a convenient invented one, and keep it in its own namespaced key (see `videos.tiktok` above). Never mix third-party fields with BIAFYT-only metadata in the same object — keep them in separate keys (`tiktok` vs `BIAFYT`) so it's always clear which side of the integration a field comes from.
