---
name: investigate
description: Investigate an existing feature, bug or technical problem before modifying code.
---

# Investigate

Use this skill when understanding the existing implementation is required before making changes.

## Objective

Understand the smallest relevant part of the codebase needed to answer the question or plan the change.

## Process

1. Identify the exact feature, bug or requested behavior.
2. Locate the relevant files.
3. Trace the execution and data flow.
4. Identify state, utilities, components and consumers involved.
5. Determine the current behavior.
6. Identify bugs, limitations and edge cases.
7. Identify dependencies between affected files.
8. Propose the smallest appropriate solution.
9. Explain relevant trade-offs.

## Rules

- Do not modify files during investigation.
- Do not analyze unrelated parts of the repository.
- Do not reread the entire repository unless genuinely necessary.
- Do not invent behavior that is not supported by the code.
- Clearly distinguish current behavior from proposed behavior.
- Prefer existing architecture and utilities.
- Identify missing information instead of guessing.
- Stop after presenting findings and the proposed approach.

## Tool usage

- Prefer code inspection, search, static analysis and existing tests before using browser or external UI automation.
- Do not use browser automation by default.
- Use browser automation only when the issue involves behavior that cannot reasonably be determined from the code, or when visual or interaction-based verification is necessary.
- When browser automation is necessary, investigate only the affected flow and relevant screens.
- Do not explore unrelated screens to gain general confidence.
- Stop browser exploration once sufficient evidence has been collected.
- For small bugs, prefer a focused investigation over broad application exploration.

## Output

Use this structure:

### Current behavior
What the code does today.

### Relevant files
Only files directly involved.

### Findings
Bugs, limitations and risks.

### Proposed solution
The recommended approach.

### Alternatives
Only when there is a meaningful trade-off.

### Implementation scope
Exactly what would need to change.

### Validation
How the change should be verified.

Do not implement anything unless explicitly requested.
