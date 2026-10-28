---
name: database-review
description: Review Laravel migrations, schema design, relationships, constraints, indexes, and data integrity for BIAFYT.
---

# Database Review

Use this skill when reviewing Laravel migrations or database schema changes.

## Check

### Schema
- Tables should represent clear domain concepts.
- Avoid premature normalization or abstraction.
- Avoid duplicated concepts.
- Prefer explicit column names.

### Relationships
- Foreign keys should represent real relationships.
- Check cardinality.
- Check delete behavior.
- Avoid orphaned records.

### Constraints
- Use appropriate nullability.
- Use unique constraints when uniqueness is a domain rule.
- Use foreign keys where appropriate.

### Indexes
- Add indexes for justified lookup patterns.
- Do not add indexes speculatively everywhere.

### Migrations
- Migrations must be reproducible.
- Avoid destructive changes without explicit approval.
- Consider existing data when modifying a schema.
- Keep migrations focused.

### BIAFYT fitness model

Remember the distinction between:

- Exercise definition
- Program
- Program day
- Program exercise
- Workout
- Workout exercise
- Exercise performance

Do not collapse these concepts unless there is a concrete reason.

## Compatibility

Legacy frontend data may contain exercise names instead of catalog IDs.

Do not remove compatibility without an explicit migration strategy.

## Scope

Review only the database-related change.

Avoid unrelated schema redesign.

## Output

Report:

1. Findings
2. Severity
3. Data integrity implications
4. Minimal recommended change
