# Animator

Local web animation inspector and visual editor for static web projects.

Current implementation uses a Node.js/TypeScript backend and a framework-free TypeScript frontend. There is no React or Electron dependency.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and use `__fixture__` as the project path to load the bundled validation project.

## Verification

```bash
npm run typecheck
npm run test
npm run build
```

The editor keeps inspected source files unchanged while experimenting. Runtime edits are applied through the isolated preview bridge and can be exported as non-destructive override files.
