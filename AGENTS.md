# AGENTS.md

Guidance for AI agents (and humans) working on this repository. Read this
before making changes and follow it.

## Project

A **free, open and self-hosted desktop Git client**. Electron + React +
TypeScript, bundled with **electron-vite**, styled with **Tailwind**, global
state with **Zustand**. The Git backend shells out to the system `git` through
**`simple-git`** — no native dependencies to compile.

## Golden rules

- **English only.** All UI text, code, comments, commit messages and docs are
  written in English — always.
- **Conventional Commits.** Every commit follows the
  [Conventional Commits](https://www.conventionalcommits.org/) spec
  (`feat:`, `fix:`, `refactor:`, `ci:`, `docs:`, `chore:`, …) with an optional
  scope, e.g. `feat(graph): …`.
- **Commit and push only when explicitly asked.** Never do it on your own
  initiative.
- **Always work on a branch + pull request — never commit to `main` directly.**
  Create a branch named `<slug>/<topic>` — where `<slug>` is the contributor's
  short handle (e.g. `tckp` for teckperry) and `<topic>` describes the change —
  and open a PR to `main`. `main` moves only through merged PRs (and release
  tags).
- **The build must be green before committing.** Run `npm run build` (it runs
  `typecheck` + the electron-vite build) and fix any error first.
- **Never hardcode colors or identity.** They live in one place (see Branding).

## Architecture

```
src/
├── shared/    types.ts (data model) + ipc.ts (channel names) — framework-free,
│              imported by both main and renderer
├── main/      Electron main process
│   ├── ipc.ts        registers handlers, each wrapped in the { ok, data|error } envelope
│   └── services/     gitService (simple-git), sshService, updateService, diffParser, store
├── preload/   secure bridge exposing a typed window.api
└── renderer/  React UI
    ├── branding.ts   ⭐ identity + theme (see Branding)
    ├── store/        global state (Zustand)
    ├── lib/          ipc helpers, graph layout, formatting
    └── components/    UI
```

## Implementation rules

### IPC (main ↔ renderer)

Every call returns a typed envelope: `{ ok: true, data } | { ok: false, error }`.
To add a new call, touch these places **in order**:

1. `src/shared/ipc.ts` — add the channel name to the `Channels` const.
2. `src/main/ipc.ts` — register it with `handle(Channels.x, …)`; the wrapper
   turns thrown errors into the envelope.
3. `src/preload/index.ts` — add a typed method to `api` via `invoke<T>(Channels.x, …)`.
4. In the renderer, call it as `await call(api.x(...))` — `call()`
   (`src/renderer/src/lib/ipc.ts`) unwraps the envelope and throws on failure.

Business logic goes in a `src/main/services/*` module, not inline in `ipc.ts`.

### Git backend

- Use `simple-git`; never bundle native git bindings.
- Instances are cached per repository path (`gitService`).
- For anything non-trivial prefer `git.raw([...])` with explicit args; keep
  parsing inside the service and return the shared types.

### State (renderer)

- Global state is a single Zustand store (`store/useStore.ts`).
- Wrap mutations in the store's `run(label, fn, successMsg?)` helper: it toggles
  the busy flag, refreshes data and shows a toast. Reads go through `call(api.…)`.

### Branding & styling

- Identity (name, tagline, theme colors, graph palette) lives **only** in
  `src/renderer/src/branding.ts`; the executable name / appId live in
  `package.json` and `electron-builder.yml`.
- Theme colors are injected as CSS variables (RGB channels) and exposed as
  Tailwind **semantic tokens**: `app-bg`, `app-panel`, `app-panel-2`,
  `app-border`, `app-text`, `app-muted`, `app-accent`, `app-danger`,
  `app-success`, `app-warning`. **Always use these tokens**
  (e.g. `bg-app-panel`, `text-app-muted`, `bg-app-accent/15`) so light/dark and
  rebranding keep working. Never hardcode hex colors in components; for dynamic
  colors (e.g. graph lanes) derive from `branding.graphColors`.
- Match the surrounding code's style, comment density and idioms.

### Quality gate

- `npm run typecheck` for types; `npm run build` before every commit.
- For user-facing / visual changes, offer to run the app (`npm run dev`) so the
  change can be validated live.

## Development workflow

Follow this loop for each task:

1. **Sync & report** — start with `git fetch` and always tell the user whether
   `origin/main` has advanced (new commits) or the local branch is behind. If
   `main` moved, update it before branching. The user must never be left unaware
   that the remote moved.
2. **Branch** — from an up-to-date `main`, create `<slug>/<topic>` (`<slug>` is
   your short handle, e.g. `tckp` for teckperry). Never work on `main`.
3. **Understand** — read the relevant files before changing anything.
4. **Implement** — follow the rules above; keep each change focused.
5. **Verify** — `npm run build` must pass; offer to run the app for visual
   changes.
6. **Commit** — only when asked; one cohesive change per commit, Conventional
   Commits.
7. **Push & PR** — only when asked: push the `<slug>/<topic>` branch and open a
   pull request to `main` (`gh pr create`). Do not push to `main` directly; the
   user reviews/merges the PR.
8. **Ask: "Do you want to publish a new tag?"** (after the PR is merged into
   `main`, since release tags are cut from `main`)

   When the user agrees, the agent prepares the release **locally** (do not rely
   solely on GitHub's auto-generated notes):
   - Find the previous tag: `git describe --tags --abbrev=0` (none → start from
     the first commit).
   - Collect the changes since then: `git log <lastTag>..HEAD` and build a
     **release report** grouped by Conventional-Commit type
     (Features / Fixes / Refactors / …), written for humans.
   - **Bump the version — required for every tag.** Set `version` in
     **`package.json`** (and keep `src/renderer/src/branding.ts` in sync) to the
     new semver, matching the tag exactly (tag `vX.Y.Z` → version `X.Y.Z`). The
     tag and `package.json` version must never diverge: installer filenames and
     the in-app updater both read `package.json`. Commit it as
     `chore(release): vX.Y.Z`.
   - Create and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
   - **A tag must always produce a published GitHub Release with the OS
     installers attached.** The GitHub Action builds them and publishes the
     Release automatically; a bare tag only exposes source-code zips, which is
     not a real release. After the run finishes, set the Release notes to the
     locally-built report (e.g. `gh release edit vX.Y.Z --notes-file -`) and
     confirm the `.dmg`/`.zip`/`.exe`/`.AppImage`/`.deb` are attached.

## Releases (reference)

- `.github/workflows/release.yml` builds installers on any `v*` tag: macOS
  arm64 + Intel (`.dmg`/`.zip`), Windows (`.exe`), Linux (`.AppImage`/`.deb`),
  and attaches them to a **published** GitHub Release automatically.
- Builds are **unsigned** (macOS is ad-hoc signed via `build/afterPack.js` so it
  isn't blocked as "damaged"); the README documents the first-launch steps.
- The in-app updater notifies users when a newer **published** (non-draft)
  release exists.
