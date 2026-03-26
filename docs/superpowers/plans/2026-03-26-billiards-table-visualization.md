# Billiards Table Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a draggable table visualization to the miniapp and draw the selected shot route on top of the table without triggering automatic recalculation.

**Architecture:** Keep the solver contract unchanged and add a small presentation layer in `miniprogram/pages/index/` that turns `SolveRequest`/`SolveResponse` into render state. Separate editable ball positions from solved results so dragging only updates the edit model while `Calculate` re-runs the solver and refreshes the route overlay. Use pure helper functions for coordinate mapping, candidate selection, and line-point extraction so the page stays testable.

**Tech Stack:** WeChat Mini Program WXML/WXSS/TypeScript, Vitest, existing `solveShot` adapter and `SolveResponse` types.

---

### Task 1: Add table-view helpers and failing unit tests

**Files:**
- Create: `miniprogram/pages/index/table-view.ts`
- Create: `src/core/__tests__/table-view.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildCandidateRenderModel, mapTablePointToPercent } from "../../../miniprogram/pages/index/table-view";

const mockRequest = {
  mode: "mode1_contact_paths",
  table: { width: 2.84, height: 1.42, pocketR: 0.06 },
  balls: [],
  constraints: {},
  input: {}
} as const;

const mockResponse = {
  solver: "local-geo",
  elapsedMs: 3,
  candidates: [
    {
      id: "candidate-a",
      score: 1,
      cushions: 2,
      blocked: false,
      segments: [{ from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, event: "start" }],
      metrics: { travelDistance: 1, minClearance: 0.5, estError: 0 }
    },
    {
      id: "candidate-b",
      score: 2,
      cushions: 3,
      blocked: false,
      segments: [
        { from: { x: 0, y: 0 }, to: { x: 0.5, y: 0.2 }, event: "start" },
        { from: { x: 0.5, y: 0.2 }, to: { x: 0.7, y: 0.5 }, event: "cushion" },
        { from: { x: 0.7, y: 0.5 }, to: { x: 0.8, y: 0.6 }, event: "contact" }
      ],
      metrics: { travelDistance: 2, minClearance: 0.4, estError: 0 }
    }
  ]
} as const;

describe("table-view helpers", () => {
  it("maps normalized table points into percentage positions", () => {
    expect(mapTablePointToPercent({ x: 0.18, y: 0.24 })).toEqual({ left: "18%", top: "24%" });
  });

  it("selects the requested candidate and exposes route segments", () => {
    const model = buildCandidateRenderModel(mockRequest, mockResponse, "candidate-b");
    expect(model.selectedCandidate?.id).toBe("candidate-b");
    expect(model.selectedCandidate?.segments).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/core/__tests__/table-view.test.ts -v`
Expected: FAIL because `table-view.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement pure helpers for:
- a stage geometry contract with `left`, `top`, `width`, and `height` in pixels plus forward/inverse mapping functions
- percentage mapping from normalized coordinates
- touch/pixel to normalized table coordinates using the stage rect
- clamping in normalized space with `ball.radius` so dragged balls stay solver-valid inside the table bounds
- candidate lookup by id
- selected-candidate fallback to the first feasible result (`!candidate.blocked && !candidate.rejectReason`)
- extracting route points from `segments` for rendering
- extracting explicit markers for `cushion`, `contact`, and terminal/end points

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/core/__tests__/table-view.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/index/table-view.ts src/core/__tests__/table-view.test.ts
git commit -m "feat: add table view helpers"
```

### Task 2: Refactor page state to separate edit and solve models

**Files:**
- Modify: `miniprogram/pages/index/index.ts`
- Modify: `src/core/__tests__/regression.test.ts`

- [ ] **Step 1: Write the failing test**

Add regression coverage that verifies:
- dragging or updating the edit model does not call `solveShot`
- `handleCalculate` uses the current edited ball positions
- Mode 2 still passes through `input.cueDirection` unchanged while swapping in the edited balls
- switching candidates only updates selection state and does not re-run the solver
- dragging preserves the previous result overlay until the next explicit calculate
- handlers can accept a touch event shape using `changedTouches[0].pageX/pageY` and/or `touches[0].pageX/pageY`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/core/__tests__/regression.test.ts -v`
Expected: FAIL because the page still has a single result-oriented state and no drag-specific behavior.

- [ ] **Step 3: Write minimal implementation**

Refactor the page so it owns:
- an edit-state ball list
- a solve-state result cache
- a selected-candidate id
- drag handlers for the table visualization

Keep the existing `calculate` button behavior, but make it read from the edit-state balls instead of the original hardcoded request objects. Make sure no drag handler invokes `solveShot`.
For request composition, preserve the mode template and only replace the ball list from edit state:
- Mode 1: reuse the mode template and replace balls from edit state
- Mode 2: reuse the mode template, replace balls from edit state, and preserve `input.cueDirection`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/core/__tests__/regression.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/index/index.ts src/core/__tests__/regression.test.ts
git commit -m "feat: separate edit and solve state on index page"
```

### Task 3: Rebuild the miniapp page layout for the table visualization

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `miniprogram/pages/index/index.ts` if view helpers need extra bindings

- [ ] **Step 1: Write the failing test**

No automated test is required for markup-only changes. Instead, update the page structure so the new rendering helpers have obvious targets for balls, route segments, and candidate cards.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/core/__tests__/regression.test.ts -v`
Expected: PASS; this step is only a pre-check before the UI rewrite.

- [ ] **Step 3: Write minimal implementation**

Use a single `canvas` overlay for route segments and event markers, with WXML layers for the table surface, draggable balls, and result cards.
Use `wx.createCanvasContext` with a dedicated `canvas-id`, measure `#table-stage` via `createSelectorQuery()`, and redraw after `onReady`, after successful `Calculate`, after candidate changes, and after drag move/end. Scale the backing store with `devicePixelRatio`.
Keep all `wx` calls inside page lifecycle methods or event handlers so the Vitest imports stay Node-safe; the tests should only need to stub `Page` and solver imports.

Canvas note:
- convert touch positions back into normalized table coordinates through the same stage geometry helper used for drawing

Render:
- a fixed-aspect table stage that follows `request.table.width / request.table.height`
- rails/bounds plus pocket or corner hints
- absolutely positioned balls with distinct visuals for cue, target, and obstacle roles
- an overlay layer for route segments and key points
- a result list that shows candidate id/name, cushions, travel distance, min clearance, and reject reason/feasible status
- one selected candidate highlighted
- the existing mode toggle and calculate button

Style:
- keep the existing warm table palette
- make the table stage visually distinct from the control panel
- ensure mobile widths still fit without horizontal scrolling

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/core/__tests__/regression.test.ts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/index/index.ts miniprogram/pages/index/index.wxml miniprogram/pages/index/index.wxss miniprogram/pages/index/table-view.ts src/core/__tests__/regression.test.ts src/core/__tests__/table-view.test.ts
git commit -m "feat: add billiards table visualization"
```

### Task 4: Verify end-to-end behavior and docs

**Files:**
- Modify: `README.md` if the miniapp usage notes need a short update
- Modify: `src/core/__tests__/adapter.test.ts` only if the page import paths change

- [ ] **Step 1: Run the focused regression suite**

Run: `npm test -- src/core/__tests__/regression.test.ts -v`
Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Inspect the miniapp page manually**

Open the project in WeChat DevTools and verify:
- dragging a ball only updates the table
- `Calculate` refreshes the route
- selecting a different candidate changes the overlay only

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/index/index.ts miniprogram/pages/index/index.wxml miniprogram/pages/index/index.wxss miniprogram/pages/index/table-view.ts src/core/__tests__/regression.test.ts src/core/__tests__/table-view.test.ts
git commit -m "feat: finish table visualization follow-up"
```
