---
name: architecture-review
description: Review BIAFYT architecture, state management, data flow, dependencies, scalability and backend readiness.
---

# Architecture Review

Review the system from a senior software architecture perspective.

## Evaluate

Consider:

- Separation of concerns.
- Data flow.
- State ownership.
- Single sources of truth.
- Component responsibilities.
- Business logic placement.
- Coupling.
- Reusability.
- Dependency management.
- Error handling.
- Performance.
- Security.
- Scalability.
- Maintainability.
- Future backend integration.

## Principles

- Preserve the existing architecture when it is adequate.
- Prefer the smallest solution that correctly solves the problem.
- Avoid unnecessary abstractions.
- Avoid unnecessary dependencies.
- Avoid duplicate sources of truth.
- Keep business logic separate from presentation when appropriate.
- Do not redesign architecture merely for stylistic reasons.
- Consider how a future backend would affect the proposed solution.
- Do not introduce backend assumptions into demo/local logic without explicit planning.

## Review process

Before recommending a structural change:

1. Identify the current implementation.
2. Identify all relevant consumers.
3. Trace the data flow.
4. Identify risks and dependencies.
5. Consider the simplest viable solution.
6. Compare alternatives when the decision is significant.

## Output

For each architectural issue:

1. Problem.
2. Current implementation.
3. Why it matters.
4. Options.
5. Trade-offs.
6. Recommended solution.
7. Files/components affected.

Do not modify files during review unless explicitly requested.
