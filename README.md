# Animator

Local visual animation inspector/editor for static and development web projects.

## Run

```bash
npm install
npm run dev
```

Open the local URL shown by the server.

Remote pages can be opened with either the instrumented Proxy preview or the embedded Browser preview. The Browser preview uses an installed Chromium-compatible browser when available; otherwise run `npm run setup:browser` once to install the managed Chromium runtime.

## Validate

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The app detects CSS animations/transitions, WAAPI and runtime motion, captures interaction events, provides timeline scrubbing/editing/presets, and exports CSS/TypeScript or safe source patches.
