# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the BIAFYT Laravel backend.

## Project

BIAFYT is a fitness/gym application.

This directory contains the backend API (Laravel 12 + Sanctum, JSON under `/api/v1`).

The repository also holds five separate front-end apps (see `../CLAUDE.md`):

- `frontend-usuario/`: the end-user app. Backend-authoritative for Auth and
  Profile; fetches the exercise catalog and the machine catalog
  (`GET /equipment`) with a local fallback; consumes `GET /me/streak` as the
  single source of truth for the **visible streak** (`current_streak` /
  `longest_streak`, roadmap 3a); drives the **real duel domain** from the
  backend (`GET /me/duels` + `DuelController`, roadmap 3b); sends a
  best-effort shadow copy of Activity/Check-in/Challenge/Reward/Duel to the
  backend. LocalStorage is still the visible source of truth for points,
  training, calendar and ranking — there is no points-authority flip. The
  duel STAKE is reconciled in LocalStorage (`AppContext#reconcileDuels`).
  `identity.user.streak` persists in LocalStorage only as a session fact for
  the points path.
- `frontend-couch/`: the Coach-role app. Sanctum auth + the coach↔athlete
  consent relationship (`CoachAthleteRelationship`, the authz gate). Coach MVP
  (slice D-COACH): a coach with an active relationship reads a shadow snapshot
  of the athlete (Profile, activity summary, streak, points balance) via
  `CoachAthleteController` and writes private `CoachNote` feedback. Not
  gym-scoped; no access to raw check-ins/rewards/duels, no editing of the
  athlete. **Fase 5**: also authors training programs FOR a related athlete
  (`CoachAthleteController` program methods over `Program→Day→Exercise` +
  `App\Support\ProgramTree`; `programs.created_by_user_id`; optional
  `programs.reference_gym_id` validated against `gym_equipment` via
  `App\Support\GymInventory`). Gate stays the active relationship — never
  GymAssignment. The athlete copies such a program into their own local
  routines via `POST /me/programs/{id}/import`, which sets
  `programs.imported_at` on the athlete's own row (persistent, per-athlete,
  idempotent) so it leaves the athlete app's "from my coach" tray for good —
  the coach's program and other athletes' copies are untouched.
- `frontend-gym/` and `frontend-gym-web/`: the Gym surfaces (`frontend-gym`
  is mobile/Capacitor, `frontend-gym-web` is web). `frontend-gym-web`
  implements the Gym MVP (slice D-GYM): a `gym_admin` manages `member`/
  `coach` roles for their gym and reads a member's shadow snapshot. **Fase
  5**: also manages the gym's equipment inventory (`equipment` global
  catalog ↔ `gym_equipment` pivot, `GymAdminController`) and files
  equipment-catalog requests (`equipment_requests` +
  `equipment_request_events` audit log).
  `frontend-gym` stays UI-foundation only. See `PROJECT_STATE.md` →
  `FASE: Gym MVP`, `FASE: Gym UI Foundation` and `FASE: 5`.
- `frontend-admin/`: the BIAFYT platform-admin dashboard (slice
  D-GYM-ONBOARDING). Reviews gym registration requests (approve/reject) and
  lists gyms. **Fase 5**: also owns the GLOBAL equipment catalog
  (`Admin\EquipmentController` — the ONLY writer of `equipment`) and reviews
  equipment-catalog requests (`Admin\EquipmentRequestController`;
  approve = associate an existing item OR create a new one, never both). The
  `equipment` table is the single source of truth for the machine library:
  besides identity/brand/model it carries the educational fields (purpose,
  `primary_muscle`, `secondary_muscles`, movement, level, tips, mistakes,
  related, `art`), seeded 1:1 from `frontend-usuario/src/data/machines.js`
  and served by the public `GET /equipment` (active only). `machines.js` is
  now only the frontend's offline fallback. All `/admin/*` endpoints are gated by `users.is_platform_admin`
  (404 otherwise). Platform-admin is a `users` boolean, granted only via
  `php artisan BIAFYT:grant-platform-admin` — never by endpoint. See
  `PROJECT_STATE.md` → `FASE: Gym Onboarding + BIAFYT Admin`.

The backend is being introduced incrementally. Do not assume that all
front-end behavior has already migrated to the backend. `PROJECT_STATE.md`
(repo root) is the authoritative record of what exists.

## Development principles

- Prefer small, verifiable changes.
- Investigate existing behavior before implementing changes.
- Do not introduce architecture changes without explicit approval.
- Avoid overengineering.
- Do not mix unrelated refactors with feature work.
- Preserve existing behavior unless the task explicitly requires changing it.
- Prefer Laravel conventions over custom abstractions.
- Do not add dependencies unless there is a concrete need.

## Workflow

Preferred workflow:

investigate
→ design/decision
→ implement
→ review/QA

For small tasks, keep the workflow small.

Do not launch unnecessary agents or perform unnecessary investigation.

If implementation requires an architectural decision that has not been approved, stop and report the decision instead of inventing one.

## Laravel

Use standard Laravel conventions unless the project has an established reason to do otherwise.

Keep responsibilities separated appropriately:

- Routes define API entry points.
- Controllers coordinate HTTP requests and responses.
- Form Requests handle non-trivial input validation.
- Models represent persisted domain data and relationships.
- Services may contain non-trivial business logic when a service is actually justified.
- API Resources may be used to control and standardize API responses.
- Migrations define and version the database schema.

Do not create repositories, DTOs, services, or other abstractions merely for architectural appearance.

A simple operation should remain simple.

## API

The backend exposes a JSON API.

Use `/api/v1` for versioned API endpoints.

Follow appropriate HTTP methods and status codes.

Validate all client-controlled input on the server.

Do not rely on frontend validation for security or data integrity.

Do not expose internal model fields unnecessarily.

Authentication and authorization are separate concerns:

- Authentication determines who the user is.
- Authorization determines what the user is allowed to access.

Do not assume that an authenticated user can access every resource.

Keep API response structures predictable and consistent.

Do not change an established API contract without explicit approval.

## Database

Use Laravel migrations for all schema changes.

Before modifying the schema:

1. Inspect existing migrations.
2. Inspect relevant models and relationships.
3. Understand how existing data is used.
4. Consider compatibility with the current frontend.

Avoid destructive migrations without explicit approval.

Use:

- foreign keys for real relationships
- appropriate nullability
- unique constraints when uniqueness is a domain rule
- indexes when justified by actual access patterns

Do not add indexes speculatively.

Keep migrations focused and reproducible.

## Fitness domain

The backend will eventually contain the application's training domain.

Keep these concepts separate:

- Exercise definition
- Program
- Program day
- Program exercise
- Workout
- Workout exercise
- Exercise performance

### Exercise definition

An exercise represents the catalog definition of an exercise.

It may contain metadata such as:

- name
- primary muscle
- secondary muscles
- movement
- level
- equipment
- type
- prescription unit

An exercise definition does not contain the sets, reps, rest, or load of a particular workout.

### Program

A program represents the user's training structure.

A program contains one or more program days.

A program day represents a position within the training program:

- Day 1
- Day 2
- Day 3
- etc.

A program day is not the same thing as a weekday.

For example:

Monday does not inherently mean Day 1.

The user's schedule determines when training occurs; the program determines which training session is performed.

### Program exercise

A program exercise represents an exercise prescribed within a program day.

Sets, reps, rest, intensity, or other prescription data belong to the program/workout context, not to the global exercise definition.

### Workout

A workout represents an actual training session.

A workout may be generated from a program day but represents the session that was actually performed.

### Workout exercise

A workout exercise represents an exercise instance inside a specific workout.

Do not collapse the exercise catalog definition and the workout exercise instance into a single concept.

### Exercise performance

Exercise performance represents actual user performance data such as:

- completed sets
- repetitions
- load
- duration
- RPE
- other measurable performance data

Do not introduce progression logic without first understanding the existing fitness model and approved training architecture.

## Exercise catalog compatibility

The end-user frontend contains:

- `frontend-usuario/src/data/training.js`
- `frontend-usuario/src/data/machines.js`

These are not equivalent catalogs.

`training.js` contains exercises used by the routine generator.

`machines.js` is specifically a machine-oriented educational catalog.

Do not treat `machines.js` as the complete exercise catalog.

The backend `exercises` table is a 1:1 seed of `frontend-usuario/src/data/exercises.js`
(same slugs, names, types, machine_id), consumed via `GET /api/v1/exercises`
with an atomic local fallback in `data/exerciseCatalog.js`. It carries
machine-specific metadata (`machine_id`) but not the routine prescription
(sets/reps/rest), which stays in `training.js`.

Legacy custom routines may contain exercise names instead of exercise IDs.

Do not remove name-based compatibility without an explicit migration strategy.

## Frontend migration

The frontend is currently transitioning from local/mock data toward the Laravel backend.

Do not migrate all functionality at once.

Prefer incremental migration:

1. Implement one backend responsibility.
2. Verify the API.
3. Connect the corresponding frontend behavior.
4. Verify the frontend.
5. Remove or reduce the old local implementation only when safe.

Do not delete existing mock/local data simply because an equivalent backend endpoint exists.

Preserve a working application throughout the migration.

## Authentication

Authentication will be handled by the backend for production behavior.

When implementing authentication:

- never trust client-side authentication state
- never store or compare plaintext passwords
- validate credentials server-side
- enforce authorization on protected resources
- do not expose sensitive authentication data in API responses

Use the project's approved Laravel authentication approach.

Do not introduce OAuth or other authentication infrastructure unless explicitly required.

## Testing and verification

There may not initially be a complete automated test suite.

When tests exist, run the most relevant tests for the changed functionality.

For changes without dedicated tests:

- verify the affected route or behavior
- inspect relevant logs/errors
- run appropriate Laravel checks
- verify that unrelated behavior was not changed

Every implementation should report:

1. Files changed
2. Cause/problem addressed
3. Implementation
4. Verification performed

## Scope control

When fixing a bug or implementing a feature:

- change only what is necessary
- avoid unrelated cleanup
- avoid opportunistic refactoring
- do not redesign existing architecture without approval
- do not modify frontend files unless the task requires frontend integration

If a broader architectural problem is discovered, report it separately rather than silently fixing it as part of a smaller task.
