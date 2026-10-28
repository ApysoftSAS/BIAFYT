# Architecture Rules

- Preserve the existing separation between state, data, utils, components and screens.
- Inspect existing implementations before creating new abstractions.
- Prefer the smallest change that correctly solves the problem.
- Avoid overengineering and premature abstraction.
- Keep pure business logic in utils when appropriate.
- Keep mock/demo data separate from application state and UI.
- Do not introduce backend-specific assumptions into frontend code unless explicitly planned.
- Do not duplicate sources of truth.
- When changing shared state, inspect all consumers before modifying the state shape.
- Do not modify unrelated files.
- For significant architectural changes, explain trade-offs before implementation.
