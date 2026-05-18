# Project Memory - chatgpt-web-bot

This folder stores durable project knowledge for AI agents.

## Purpose

Record facts that should survive chat context loss:

- architectural decisions and their rationale;
- results of difficult debugging sessions;
- important configuration details;
- repeated failures and their fixes;
- useful commands and observed behavior;
- reusable workflows, token-saving tactics, startup retrieval improvements, and instruction improvement recommendations for `gi`.

Do not store secrets, tokens, passwords, production data, private user data, or unnecessary project-specific details.

## Files

- `NOTES.md` - durable notes that do not belong in a more specific file.
- `known-issues.md` - known problems and workarounds when present.
- `pending-tasks.md` - active project task checklist.
- `instruction-kit.json` - local copied instruction-kit version and applied migrations.
- `git-preferences.json` - commit-message language preferences.
- `task-managers.json` - optional project-local task-manager configuration when enabled.
- `instruction-updates/` - optional local fallback for reusable instruction recommendations when not explicitly writing to the shared instruction library.

## Experience Intake

This project may act as an experience source for the shared `gi` instruction kit.
When a reusable improvement is discovered, capture it as intake only; it is not
accepted guidance until reviewed and moved into shared instructions, patterns,
templates, checklists, or migrations.

Recommendations should include:

- observed problem;
- proposed reusable rule or artifact;
- evidence paths or commands;
- expected benefit;
- risks;
- privacy review.

## Task Managers

Task-manager integration is optional and project-local. If enabled:

- configure managers only in `tools/project-memory/task-managers.json`;
- require a real project-specific API `base_url`;
- do not leave endpoint fields empty, guessed, or set to `TODO`;
- do not store secrets, tokens, cookies, or passwords;
- verify workflow-specific capabilities before posting plans or starting sprint work.

## Rule

If a future agent spends time rediscovering the same fact, record the fact here.
