---
name: api-review
description: Review BIAFYT Laravel API endpoints for consistency, validation, authentication, authorization, HTTP semantics, and backwards compatibility.
---

# API Review

Use this skill when reviewing Laravel API routes, controllers, requests, resources, or API contracts.

## Check

### Routes
- Use clear REST-oriented routes where appropriate.
- Use correct HTTP verbs.
- Keep routes grouped and versioned.
- Apply authentication middleware where required.

### Requests
- Validate all client-controlled input.
- Prefer Form Requests for non-trivial validation.
- Do not rely exclusively on frontend validation.

### Responses
- Return predictable JSON structures.
- Use appropriate HTTP status codes.
- Avoid leaking internal implementation details.
- Avoid returning unnecessary model fields.

### Authentication
- Verify which endpoints require authentication.
- Verify authorization separately from authentication.
- Do not assume that an authenticated user can access every resource.

### Resources
- Use API Resources when they improve response consistency or prevent accidental data exposure.
- Do not introduce Resources unnecessarily for trivial internal responses.

### Compatibility
- Avoid breaking existing consumers.
- Preserve `/api/v1` conventions once established.
- Do not change existing contracts without explicit approval.

## Scope

Review only the API-related change.

Do not recommend unrelated refactors or architecture changes.

## Output

Report:

1. Findings
2. Severity
3. API contract affected
4. Minimal recommended change
