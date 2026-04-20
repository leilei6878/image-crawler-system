# Agent Instructions

This repository is developed incrementally. When making changes:

## General Rules
1. Do not perform unnecessary full-project rewrites.
2. Prefer minimal, targeted, reviewable changes.
3. Read README.md and docs/PROJECT_CONTEXT.md before making changes.
4. Update docs when changing behavior, commands, or architecture.

## Code Rules
1. Keep modules decoupled.
2. Keep crawler source-specific logic isolated from shared logic.
3. Avoid hardcoded paths, credentials, or magic values.
4. Prefer configuration through environment variables or config files.
5. Add logging for critical operations and failures.
6. Network operations should support timeout and retry where practical.

## Delivery Rules
For each task:
1. Explain what files were changed
2. Explain how to run or verify
3. Explain any risks or follow-up work
4. Keep changes scoped to the requested goal

## Refactor Rules
Large refactors should only happen if:
- there is a clear architectural problem
- the benefit is documented
- the blast radius is explained