---
name: implement
description: Implement an approved change in BIAFYT with minimal scope, consistency and verification.
---

# Implement

Use this skill after the implementation approach has been analyzed and approved.

## Process

1. Re-read the relevant files.
2. Confirm the approved scope.
3. Implement only the requested change.
4. Reuse existing architecture, components and utilities.
5. Avoid unrelated refactors.
6. Inspect the resulting diff.
7. Run the smallest relevant validation.
8. Run lint and build when appropriate.
9. Report the result.

## Rules

- Do not expand scope without approval.
- Do not introduce unnecessary dependencies.
- Do not rewrite working code without a concrete reason.
- Do not silently change unrelated business behavior.
- Do not modify unrelated files.
- Preserve existing conventions.
- Preserve existing behavior outside the requested change.
- If implementation reveals a significant architectural problem, stop and explain it instead of expanding scope.
- If validation fails because of the change, fix the issue before reporting completion.

## Validation

Prefer the smallest useful validation first.

Examples:

- Targeted behavior check.
- `npm run lint`
- `npm run build`

Run broader validation only when justified by the scope of the change.

## Completion report

Report:

- Files changed.
- What changed.
- Validation performed.
- Validation results.
- Remaining risks or limitations.
