# Self-hosted Git Client

A **free, open and entirely yours** desktop Git client.
Built with Electron + React + TypeScript.

> The name is set in a single place and can be changed in seconds (see
> [Rebranding](#rebranding)).

## Download & install

Grab the installer for your OS from the
[**Releases**](../../releases/latest) page:

| OS | File | How to install |
| --- | --- | --- |
| macOS | `.dmg` | Open it and drag the app into **Applications**. |
| Windows | `.exe` | Run the installer. |
| Linux | `.AppImage` | `chmod +x *.AppImage` then run it. Or install the `.deb`. |

### First launch (unsigned app)

Builds are **not code-signed**, so on the first launch your OS shows a
security warning. This is expected — just allow it once:

- **macOS**: right-click the app → **Open** → **Open**. If it's still
  blocked, run:
  ```bash
  xattr -cr "/Applications/Self-hosted Git Client.app"
  ```
- **Windows**: on the SmartScreen dialog click **More info** → **Run anyway**.

Prefer to build it yourself? See [Development](#development) and
[Build / distribution](#build--distribution).

## Features

- 🌳 **Commit graph** as a colored tree (multiple lanes, merges, branches).
- 🔍 **Per-commit diff**: click a commit → file list → diff with line numbers.
- ✅ **Staging area**: stage/unstage per file or all at once, discard changes, commit (+ amend).
- ⬆️⬇️ **Push / Pull / Fetch** with ahead/behind indicators.
- 🌿 **Branches**: create, checkout, merge, delete (local and remote, with tracking).
- 🏷️ **Tags**, 📦 **Stashes** (create/apply/pop/drop), multiple **remotes**.
- ⏪ Reset (soft/mixed/hard), revert, cherry-pick, checkout a commit.
- 🔑 **SSH key management**: list, generate (ed25519/RSA), copy public key, delete.
- 🎨 Light/dark theme, centralized branding.

## Requirements

- Node.js 18+ and `git` in the PATH.
- `ssh-keygen` (bundled with macOS/Linux and Git for Windows) for SSH keys.

## Development

```bash
npm install
npm run dev
```

## Build / distribution

```bash
npm run build        # build main, preload and renderer
npm run dist:mac     # package for macOS (dmg/zip)
npm run dist:win     # Windows (nsis)
npm run dist:linux   # Linux (AppImage/deb)
```

## Rebranding

Everything related to identity is centralized:

1. **Name, tagline, colors, graph palette** →
   [`src/renderer/src/branding.ts`](src/renderer/src/branding.ts)
2. **Executable name / appId** → `package.json` (`name`) and
   [`electron-builder.yml`](electron-builder.yml) (`productName`, `appId`).

Nothing else needs to be touched.

## Architecture

```
src/
├── shared/         # types and IPC channel names (shared main <-> renderer)
├── main/           # Electron main process
│   ├── index.ts
│   ├── ipc.ts      # IPC handler registration (envelope { ok, data|error })
│   └── services/   # gitService (simple-git), sshService, diffParser, store
├── preload/        # secure bridge: exposes a typed window.api
└── renderer/src/   # React UI
    ├── branding.ts # ⭐ app identity
    ├── store/      # global state (zustand)
    ├── lib/        # ipc, graph layout, formatting
    └── components/ # TitleBar, Toolbar, Sidebar, CommitGraph, DiffViewer, …
```

The backend uses the system `git` executable through `simple-git` (no native
dependencies to compile). Communication with the UI goes through typed IPC with
an `{ ok, data | error }` envelope.

## License

MIT
