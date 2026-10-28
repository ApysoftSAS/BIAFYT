---
name: backend-review
description: Review Laravel backend code for architecture, separation of concerns, validation, security, maintainability, and consistency with the BIAFYT backend architecture.
---

# Backend Review

Use this skill when reviewing Laravel backend changes.

## Review priorities

1. Correctness
2. Security
3. Separation of responsibilities
4. Maintainability
5. Consistency with the existing BIAFYT architecture
6. Minimality of the change

## Check

### Controllers
- Controllers should remain thin.
- Avoid putting business logic directly in controllers.
- Validate incoming data through Form Requests when appropriate.
- Return consistent API responses.

### Models
- Relationships should be explicit.
- Avoid unnecessary model logic.
- Do not introduce abstractions without a concrete need.

### Services
- Use services when business logic is complex or reused.
- Do not create services merely to wrap a single model operation.

### Validation
- Validate external input.
- Do not trust frontend validation.
- Prefer explicit validation rules.

### Security
- Check authorization.
- Check authentication requirements.
- Avoid exposing internal fields unnecessarily.
- Check mass-assignment configuration.
- Never expose secrets or sensitive data.

### API
- Use appropriate HTTP methods and status codes.
- Keep request and response structures predictable.
- Preserve API versioning when present.
- Avoid breaking existing API contracts without explicit approval.

### Database
- Check foreign keys and relationships.
- Check nullable fields.
- Check indexes where justified.
- Avoid duplicated data unless there is a clear reason.
- Avoid destructive migrations without explicit approval.

## Scope

Do not recommend unrelated refactors.

Prefer the smallest change that solves the identified problem.

## Output

Report:

1. Findings
2. Severity
3. Why it matters
4. Minimal recommended change

If there are no relevant issues, say so explicitly.
