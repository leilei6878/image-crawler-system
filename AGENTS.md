# AGENTS.md

Guidance for AI coding agents working in this repository.

## Working Principles

- Keep changes scoped to the requested task.
- Do not perform unnecessary full-project rewrites.
- Do not refactor unrelated code.
- Preserve existing conventions once application code exists.
- Prefer small, reviewable changes.
- Do not commit secrets, tokens, cookies, or production configuration.

## Repository Context

- Read `README.md` first for project overview.
- Read `docs/PROJECT_CONTEXT.md` before making architecture-level changes.
- Check `docs/TODO.md` for current work items and avoid duplicating tasks.

## Code Rules

- Keep modules decoupled.
- Keep crawler source-specific logic isolated from shared logic.
- Avoid hardcoded paths, credentials, or magic values.
- Prefer configuration through environment variables or config files.
- Add logging for critical operations and failures.
- Network operations should support timeout and retry where practical.

## Validation

Before handing off changes:

- Confirm the requested files exist.
- Run the available local checks for the current project stage.
- If implementation code is added later, run the relevant formatter, linter, and test suite.

## Environment

- Use `.env.example` as the public template for required configuration.
- Keep local `.env` files untracked.
- Add new environment variables to `.env.example` with safe placeholder values.

## Delivery Rules

For each task, include:

- Files created or updated.
- Commands or checks run.
- Any assumptions made because project runtime or architecture is not yet defined.
- Any risks or follow-up work.

## Refactor Rules

Large refactors should only happen if:

- There is a clear architectural problem.
- The benefit is documented.
- The blast radius is explained.
