---
name: code-review
description: Review BIAFYT code changes for correctness, regressions, security, performance and maintainability.
---

# Code Review

Review the current implementation or git diff as a senior software engineer.

## Review

Check:

- Correctness.
- Bugs.
- Edge cases.
- Regressions.
- State consistency.
- Data flow.
- Error handling.
- Security.
- Performance.
- Accessibility when UI is affected.
- Maintainability.
- Readability.
- Unnecessary complexity.
- Consistency with CLAUDE.md and project rules.
- Whether unrelated files were modified.

## Process

1. Inspect the git diff.
2. Identify every affected file.
3. Understand the affected execution flow.
4. Check callers and consumers of changed code.
5. Look for edge cases and failure states.
6. Check whether existing architecture and conventions are respected.
7. Run relevant validation when appropriate.
8. Classify findings.

## Severity

CRITICAL
- Security issue, data corruption or severe functional failure.

HIGH
- Significant bug, regression or architectural problem that should be fixed before continuing.

MEDIUM
- Important quality, maintainability or UX issue.

LOW
- Minor improvement or optional cleanup.

## Principles

- Do not criticize code merely because another implementation is possible.
- Focus on actual problems and meaningful risks.
- Prefer evidence from the repository over assumptions.
- Do not recommend unrelated refactors.
- Do not modify files during review unless explicitly requested.

## Output

### Summary
Overall assessment.

### Findings

For each finding:

- Severity
- File and location
- Problem
- Why it matters
- Recommended fix

### What looks good
Important things that should remain unchanged.

### Validation
Commands or checks performed and their results.

### Verdict

One of:

- APPROVE
- APPROVE WITH MINOR FIXES
- CHANGES REQUIRED
