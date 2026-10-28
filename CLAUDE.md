# BIAFYT

BIAFYT is a fitness/gym application. The repository holds five separate
front-end apps plus one backend:

- `frontend-usuario/`: the end-user app. React 19 + Vite + Capacitor. The
  backend is authoritative only for **Auth** and **Profile**; the exercise
  catalog is fetched from the backend with an atomic local fallback. Points,
  training, streak, challenges, rewards, calendar, duels and ranking are
  LocalStorage-based; Activity, Check-in, Challenge and Reward also send a
  **best-effort shadow copy** to the backend (LocalStorage stays the visible
  source of truth — there is no points-authority flip). See
  `frontend-usuario/CLAUDE.md`.
- `frontend-couch/`: the Coach-role app. React 19 + Vite + Capacitor. Sanctum
  auth plus the coach↔athlete consent relationship (`CoachAthleteRelationship`),
  which is the authorization gate. Coach MVP (slice D-COACH, CLOSED): with a
  currently **active** relationship a coach reads the athlete's Profile, an
  activity summary, the check-in streak (current/longest) and the points
  balance — activity/points/streak are **shadow/best-effort** quality — and
  writes private feedback notes (`CoachNote`). No access to the athlete's
  programs, workouts, raw check-ins, rewards or duels, and no editing of the
  athlete; the relationship is not gym-scoped. See `frontend-couch/CLAUDE.md`.
- `frontend-gym/`: the Gym mobile application surface. React 19 + Vite +
  Capacitor. Its UI foundation may be prepared before the Coach/Gym product
  phase, but no Gym business logic, authorization or domain workflows are
  implemented before that phase.
- `frontend-gym-web/`: the Gym web application surface. React 19 + Vite,
  browser-first, without Capacitor. It shares the BIAFYT visual language
  with the other applications but uses a web-oriented layout and UX.
- `frontend-admin/`: the BIAFYT platform-admin web dashboard. React 19 +
  Vite, browser-first, without Capacitor. MVP scope only: review gym
  registration requests (approve/reject) and a read-only gym list. Every
  `/admin/*` endpoint is gated by `users.is_platform_admin` (404 otherwise).
  See `frontend-admin/CLAUDE.md` and `BIAFYT_BUSINESS_CORE.md`
  §46 D-GYM-ONBOARDING.

- `backend/`: Laravel 12 + Sanctum JSON API under `/api/v1`. Introduced
  incrementally. See `backend/CLAUDE.md`.
- `.claude/`: project-level Claude Code configuration (skills, agents, rules).

BIAFYT is one product with three distinct application surfaces:
**Usuario/Cliente**, **Coach** and **Gym** (plus `frontend-admin/`, an
internal platform-operations dashboard, not a customer surface). These
applications share the same business domain but have different
responsibilities, permissions and workflows.
Business rules that cross application boundaries belong in
`BIAFYT_BUSINESS_CORE.md`, not in an individual app's `CLAUDE.md`.

The front-end apps are independent projects (no monorepo). Shared
visual-system files (`theme/`, `App.css`, `components/UI.jsx`, …) are copied
by hand between them and must be re-synced manually.


## Context and sources of truth

Before starting any non-trivial task or new phase, read:

1. `BIAFYT_BUSINESS_CORE.md` — authoritative business/domain decisions.
2. `PROJECT_STATE.md` — authoritative project state, roadmap, implementation
   status, known debt and phase decisions.
3. The applicable app/backend `CLAUDE.md`.
4. The relevant code and tests.

Do not treat planned, documented, mocked, or proposed behavior as implemented.

When determining what the system actually does today, code and tests are the
final authority over documentation.

When determining what the product is supposed to mean, `BIAFYT_BUSINESS_CORE.md`
is the authority.

Never silently invent or resolve missing business rules, permissions,
relationships, domain semantics, endpoints, fields, or architecture.

If business rules, project state, documentation, and code contradict each
other and the current task does not explicitly resolve the contradiction,
stop and report it before implementing.


## Development principles

- Prefer small, verifiable changes.
- Investigate before implementing when behavior or architecture is unclear.
- Do not introduce architecture changes without explicit approval.
- Avoid overengineering.
- Do not mix unrelated refactors with feature changes.
- Preserve existing behavior unless the task explicitly requires changing it.

## Project workflow

Preferred workflow:

investigate
→ design/decision
→ implement
→ review/QA

For small tasks, keep the workflow small and do not launch unnecessary agents.

## Backend

The backend is being introduced incrementally. Do not assume that frontend
state or business logic has already been migrated. Do not migrate the entire
frontend to the backend in one change.

## Fitness domain

Keep these concepts separate:

- Exercise definition
- Program
- Program day
- Program exercise
- Workout
- Workout exercise
- Exercise performance

A weekday is not the same thing as a program training day.

## Claude Code

Use the project-level Skills and Agents under `.claude/`.

Prefer existing Skills and Agents over creating new ones.

Do not create new Skills, Agents, or rules for one-off tasks.

Use the smallest appropriate set of tools for each task.
