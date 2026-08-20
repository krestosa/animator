# Animator

Local web animation inspector and visual editor MVP. Animator serves an arbitrary static project through a local Node process, injects temporary runtime instrumentation into the preview response, correlates runtime motion with static CSS/JS/TS analysis, and keeps edits non-destructive until export.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, enter an absolute local project path, and click **Open project**. For validation, use `__fixture__` or the repository's `fixture/` directory.

Production/local build:

```bash
npm run typecheck
npm run test
npm run build
npm run start
```

## MVP coverage

- Local filesystem project loading with path traversal protection and file tree.
- Multi-HTML entry discovery and live same-origin iframe preview.
- Runtime DOM identity, element picker, dynamic insertion/removal tracking.
- CSS keyframe and transition static analysis with source location where available.
- TypeScript Compiler API analysis for WAAPI, rAF, style writes, class/attribute mutation, and generic motion candidates.
- Runtime CSS animation, transition and WAAPI observation through browser animation APIs.
- Interaction/mutation event recording and timeline markers.
- Timeline selection, zoom, draggable playhead scrubbing for controllable Animation objects, play/pause/restart.
- Duration/easing live overrides.
- Editable presets created through WAAPI.
- Read-only source viewer and source navigation.
- CSS/TypeScript snippet generation and non-destructive `.animator/animator-overrides.css` / `.ts` export.
- Undo/redo for animation timing edits.

## Known limits

Arbitrary rAF/canvas/WebGL animation cannot be safely reconstructed or rewound. rAF and direct style writes are statically/runtime observable but only controllable when they also surface as a browser `Animation`. CSS source rewriting and AST-based in-place JS/TS mutation are intentionally not automatic in this MVP; when attribution is insufficient, Animator exports overrides instead. Dev-server applications with backend-specific routing may need to be built to static output or loaded through a future proxy adapter.
