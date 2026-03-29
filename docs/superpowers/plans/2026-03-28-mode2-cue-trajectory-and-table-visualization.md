# Cue Trajectory and Table Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `mode2` a cue-ball-only trajectory preview with pockets, continuous route lines, and uniform table scaling, while preserving the existing `mode1` flow.

**Architecture:** Treat the page as the interaction shell and the solver as the source of trajectory truth. Task 1 rewires page state and request composition around cue-only `mode2` input; task 2 teaches both solver trees to stop on pockets and cap the path at four cushions as a normal upper bound; task 3 turns solver output into a line-based render model with pocket anchors and uniform-scale table styling; task 4 runs the full regression sweep and a manual miniapp smoke check.

**Tech Stack:** TypeScript, WeChat Mini Program (`WXML`/`WXSS`), Vitest, local geometry solver.

---

**Implementation note:** this repo keeps mirrored core sources in both `src/core` and `miniprogram/core`. Any solver or shared-core change must be applied to both trees so the tests and the miniapp stay in sync.

### Task 1: Rework mode2 page state into cue-only input plus direction state

**Files:**
- Modify: `miniprogram/pages/index/index.ts`
- Modify: `fixtures/scenes/mode2-direction.json`
- Modify: `src/core/__tests__/regression.test.ts`

- [x] **Step 1: Write the failing regression tests**

Add regression coverage that proves `mode2` now uses only the cue ball in the edited state and request payload, and that direction dragging is edit-only:

```ts
expect((page.data as Record<string, unknown>).editBalls).toEqual([
  { id: "cue", role: "cue", pos: { x: 0.2, y: 0.4 }, radius: 0.028 }
]);

handleDirectionDragMove.call(page, { touches: [{ pageX: 80, pageY: 40 }] });
expect(solveShot).toHaveBeenCalledTimes(0);
expect((page.data as Record<string, unknown>).cueDirection).toEqual({ x: 1, y: 0 });
```

Also update the fixture-backed request expectation so `handleCalculate()` submits the current cue-only ball list plus the edited `cueDirection`, not the old target-ball mode2 payload.
Update the `mode2` result summary assertions here too so the page surfaces the current direction plus a valid/invalid state instead of the old target-oriented wording.

- [x] **Step 2: Run the targeted regression test**

Run: `npm test -- src/core/__tests__/regression.test.ts -v`

Expected: FAIL with assertions showing the page still resets `mode2` to the old cue+target template and does not yet track direction drag state.

- [x] **Step 3: Implement the minimal page-state change**

Update `miniprogram/pages/index/index.ts` so that:

1. `mode2` initializes with a cue-only `editBalls` array.
2. The page stores `cueDirection` in its data and keeps it normalized.
3. A direction drag updates `cueDirection` only, and drags shorter than `0.02` keep the previous valid direction instead of submitting a zero vector.
4. Ball dragging remains edit-only and still does not trigger `solveShot`.
5. `createRequest()` copies the current `editBalls` and current `cueDirection` into the next `SolveRequest`.
6. When `mode2` returns a pocketed trajectory, the page keeps that truncated candidate visible in `solveRenderModel` and labels it invalid instead of replacing it with `NO_SOLUTION_TEXT`.
7. `summarizeResult()` / `summarizeCandidate()` include the mode2 initial direction, whether the candidate is valid, and the invalid reason when present.
8. The `mode2-direction.json` fixture matches the new cue-only request shape.

Keep the existing mode1 behavior unchanged.

- [x] **Step 4: Re-run the regression test**

Run: `npm test -- src/core/__tests__/regression.test.ts -v`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add miniprogram/pages/index/index.ts fixtures/scenes/mode2-direction.json src/core/__tests__/regression.test.ts
git commit -m "feat: switch mode2 to cue-only input"
```

### Task 2: Add pocket-aware mode2 solver logic in both core trees

**Files:**
- Modify: `src/core/solvers/mode2.ts`
- Modify: `miniprogram/core/solvers/mode2.ts`
- Modify: `src/core/__tests__/mode2.test.ts`

- [x] **Step 1: Write the failing solver tests**

Add focused cases for the new semantics:

1. A diagonal shot into a corner pocket should truncate at the pocket boundary, set `blocked=true`, and set `rejectReason="pocketed"`.
2. A shot that would continue past four cushion hits should return only the first four cushions and remain a usable candidate.
3. Replace the old obstacle-before-target contract in this file with cue-only mode2 coverage so there is no stale obstacle-dependent assertion left behind.

Use the existing mode2 test file so the same assertions run against the mirrored solver tree that Vitest already imports.

- [x] **Step 2: Run the mode2 solver test file**

Run: `npm test -- src/core/__tests__/mode2.test.ts -v`

Expected: FAIL because the current solver still treats only ball hits vs cushion hits, never detects pockets, and still has the old mode2 termination behavior.

- [x] **Step 3: Implement the solver change in both copies**

Update `src/core/solvers/mode2.ts` and `miniprogram/core/solvers/mode2.ts` together so they stay byte-for-byte consistent:

1. Add pocket-circle intersection checks using the six normalized pocket locations from the spec.
2. Choose the earliest positive hit among pocket and cushion intersections.
3. When a pocket wins, stop the trajectory at the pocket boundary, keep the last segment as `event: "end"`, and mark the candidate `blocked=true` with `rejectReason="pocketed"`.
4. Treat four cushion hits as a normal upper bound, not an invalidation reason.
5. Preserve the existing cue-direction normalization, timeout handling, and existing metric fields.
6. Remove the old obstacle-dependent mode2 behavior from the solver contract so the rewritten tests and fixture are the only remaining mode2 path.

Do not reintroduce obstacle-ball dependency into mode2; this mode is now cue-only.

- [x] **Step 4: Re-run the solver tests**

Run: `npm test -- src/core/__tests__/mode2.test.ts -v`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/core/solvers/mode2.ts miniprogram/core/solvers/mode2.ts src/core/__tests__/mode2.test.ts
git commit -m "feat: add pocket-aware mode2 trajectory"
```

### Task 3: Render pockets and continuous route lines on the table stage

**Files:**
- Modify: `miniprogram/pages/index/table-view.ts`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `src/core/__tests__/table-view.test.ts`

- [x] **Step 1: Write the failing render-model tests**

Extend the table-view tests to prove the stage model can support the new visuals:

1. The stage model exposes six pocket anchors in normalized coordinates.
2. The selected candidate model exposes continuous route-line geometry, not just point markers.
3. Candidate fallback still picks the first usable path when the requested one is blocked.

These tests should fail against the current point-only route rendering model.

- [x] **Step 2: Run the table-view helper tests**

Run: `npm test -- src/core/__tests__/table-view.test.ts -v`

Expected: FAIL because the helper layer still only returns route points and markers, and it does not yet model pockets or line segments.

- [x] **Step 3: Implement the render model and page template**

Update `miniprogram/pages/index/table-view.ts` so it builds the data the WXML needs for drawing:

1. Add a pocket-anchor helper for the six pocket centers.
2. Replace point-only route drawing with per-segment line geometry that can be rendered as rotated bars.
3. Keep cushion/contact/end markers as secondary indicators, but make the line the primary visual.
4. Preserve candidate selection fallback behavior.

Then update `miniprogram/pages/index/index.wxml` and `miniprogram/pages/index/index.wxss` so that:

1. The table visibly renders six pockets.
2. Mode2 only shows the cue ball and its direction arrow, not target or obstacle balls.
3. Continuous route lines are drawn from the new segment geometry.
4. The stage uses uniform scaling so balls and pockets stay circular instead of stretching with the container.
5. Mode2 keeps a pocketed route visible even though it is invalid, while mode1 still filters to usable candidates.

- [x] **Step 4: Re-run the helper tests and lint**

Run:

```bash
npm test -- src/core/__tests__/table-view.test.ts -v
npm run lint
```

Expected: both PASS.

- [x] **Step 5: Commit**

```bash
git add miniprogram/pages/index/table-view.ts miniprogram/pages/index/index.wxml miniprogram/pages/index/index.wxss src/core/__tests__/table-view.test.ts
git commit -m "feat: render pockets and route lines"
```

### Task 4: Full regression sweep and manual miniapp smoke check

**Files:**
- Test: `src/core/__tests__/regression.test.ts`
- Test: `src/core/__tests__/mode2.test.ts`
- Test: `src/core/__tests__/table-view.test.ts`
- Test: `src/core/__tests__/validate.test.ts`
- Test: `src/core/__tests__/adapter.test.ts`

- [x] **Step 1: Run the full automated sweep**

Run:

```bash
npm run lint
npm test
```

Expected: both PASS.

- [x] **Step 2: Re-run the targeted Vitest files if needed**

Run:

```bash
npm test -- src/core/__tests__/regression.test.ts -v
npm test -- src/core/__tests__/mode2.test.ts -v
npm test -- src/core/__tests__/table-view.test.ts -v
npm test -- src/core/__tests__/adapter.test.ts -v
```

Expected: PASS.

- [ ] **Step 3: Do a manual WeChat DevTools smoke check** (Pending: requires local WeChat DevTools UI verification)

Open the miniapp page and verify:

1. Mode2 shows only the cue ball.
2. Dragging the cue ball does not auto-calculate.
3. Dragging the direction handle updates the preview direction.
4. Clicking `Calculate` refreshes the trajectory.
5. Six pockets are visible.
6. Pocketed routes truncate and show as invalid.
7. Mode1 still behaves as before.

Expected: the visual behavior matches the accepted spec with no obvious layout stretching.
