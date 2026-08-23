# Animator

Local visual animation inspector/editor for static and development web projects.

## Desktop app

Animator's desktop shell uses a repository-local Electron runtime. Electron is not installed globally and the app does not depend on a system Electron path.

```bash
npm run desktop:setup
npm run desktop:dev
```

`desktop:setup` keeps the runtime and download state inside the Animator folder:

- `node_modules/electron/dist` — Electron runtime
- `.cache/electron` — Electron download cache
- `.cache/npm` — npm cache used by the bootstrap
- `.animator-browsers` — managed Playwright browser runtimes

The Electron main process hosts the existing Express/Vite backend in-process, so desktop mode does not start a second Node server process. Hardware acceleration remains enabled.

For a production-style local run:

```bash
npm run desktop:start
```

## Browser-only development

```bash
npm install
npm run dev
```

Open the local URL shown by the server.

Remote pages can be opened with either the instrumented Proxy preview or the Browser preview. Browser runtimes are managed locally in `.animator-browsers`.

## Validate

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The app detects CSS animations/transitions, WAAPI and runtime motion, captures interaction events, provides timeline scrubbing/editing/presets, and exports CSS/TypeScript or safe source patches.
