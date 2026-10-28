---
name: verify
description: Build, launch and drive ceiling-app (Ionic/React + Konva canvas) to verify changes at runtime with Playwright screenshots.
---

# Verify ceiling-app

## Launch

```bash
npm run dev -- --port 5199 --strictPort   # vite, base '/' in dev
```

No backend; all state lives in localStorage (`ceiling_projects`, `ceiling_fabrics`, …).

## Drive with Playwright

Playwright is in devDependencies but scripts outside the repo must import it by
absolute path: `import { chromium } from '/…/ceiling-app/node_modules/playwright/index.mjs'`.
Use a mobile-ish viewport (420×900) — the UI is phone-first.

Seed a project + room directly, then deep-link to the editor:

```js
await page.goto(BASE);
await page.evaluate(p => localStorage.setItem('ceiling_projects', JSON.stringify([p])), project);
await page.goto(`${BASE}/project/${projectId}/room/${roomId}`);
```

Room shape: see `createRoom()` in `src/lib/storage.ts` (empty `points`, `scale: 50`).

## Canvas gotchas

- The drawing is Konva → nothing queryable in the DOM. Evidence = screenshots
  plus pixel-count probes via `canvas.getContext('2d').getImageData(...)`.
- Fastest way to a closed polygon: empty room → click «готовые шаблоны» →
  pick a template by its Russian name («Прямоугольник», «Г-образная», …).
- Drawing by mouse clicks: grid snap is 40 px; with an empty room the viewport
  is identity, so world coords = client coords − canvas bbox origin.
- Mouse clicks in draw mode place a point on anything but a placed vertex
  (wall hit bands, the preview line); closing = click within 24 px of point 0.
- After a committed polygon exists, vertex screen position = replicate
  `fitView`: `scale = min(4, (W−120)/bw, (H−120)/bh)`, centre the bbox.
- Clear the drawing via the ⋮ toolbar menu → «Очистить чертёж» (remounts the
  canvas via `canvasKey`).
