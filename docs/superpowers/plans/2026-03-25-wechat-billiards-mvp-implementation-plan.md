# WeChat Billiards MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable WeChat Mini Program MVP that supports (1) mode1 multi-path cue-to-target calculation with 2-5 cushion search + obstacle avoidance and (2) mode2 cue-direction trajectory simulation.

**Architecture:** Use a strict UI/Adapter/Solver split. Keep all solver code in pure TypeScript modules with Vitest coverage, then call it from Mini Program pages through a thin adapter. Start with local geometric solver only, but keep `solver` contract ready for remote physics solver replacement.

**Tech Stack:** WeChat Mini Program (native), TypeScript, Node.js scripts, Vitest, ESLint.

---

## Announce

I'm using the writing-plans skill to create the implementation plan.

## Required References

- Spec: `docs/superpowers/specs/2026-03-25-wechat-billiards-design.md`
- Skills to follow during execution: `@superpowers/test-driven-development`, `@superpowers/verification-before-completion`

## Planned File Structure

- Create: `package.json` - scripts for test/lint/build
- Create: `tsconfig.json` - TypeScript baseline for core solver code
- Create: `vitest.config.ts` - unit/regression test runner config
- Create: `src/core/types.ts` - domain types (`Vec2`, `Ball`, `SolveRequest`, `SolveResponse`)
- Create: `src/core/validate.ts` - input validation and defaults
- Create: `src/core/geometry.ts` - vector math, reflection math, segment utilities
- Create: `src/core/collision.ts` - channel-vs-ball collision checks
- Create: `src/core/solvers/mode1.ts` - 2-5 cushion candidate generation/filter/sort
- Create: `src/core/solvers/mode2.ts` - directional trajectory simulation
- Create: `src/core/adapter.ts` - `solveShot` stable API boundary
- Create: `src/core/__tests__/*.test.ts` - unit and regression tests
- Create: `fixtures/scenes/*.json` - deterministic regression scenes
- Create: `miniprogram/app.json` - app pages configuration
- Create: `miniprogram/app.ts` - app bootstrap
- Create: `miniprogram/app.wxss` - global style
- Create: `miniprogram/pages/index/index.wxml` - table + controls + result list UI
- Create: `miniprogram/pages/index/index.ts` - interaction logic and adapter calls
- Create: `miniprogram/pages/index/index.wxss` - page style
- Create: `miniprogram/pages/index/index.json` - page config
- Create: `README.md` - run/test instructions

### Task 1: Bootstrap Project Skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `miniprogram/app.json`, `miniprogram/app.ts`, `miniprogram/app.wxss`
- Create: `miniprogram/pages/index/index.{json,wxml,ts,wxss}`

- [ ] **Step 1: Write failing smoke test**

```ts
// src/core/__tests__/smoke.test.ts
import { describe, it, expect } from "vitest";

describe("project bootstrap", () => {
  it("runs test runner", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify setup fails before dependency install**

Run: `npm test`
Expected: command/dependency missing error.

- [ ] **Step 3: Add minimal config + install deps**

```json
// package.json (key scripts)
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --ext .ts"
  }
}
```

- [ ] **Step 4: Run tests and verify pass**

Run: `npm install && npm test`
Expected: `smoke.test.ts` PASS.

- [ ] **Step 5: Commit**

Run:
```bash
git add package.json tsconfig.json vitest.config.ts miniprogram src/core/__tests__/smoke.test.ts
git commit -m "chore: bootstrap miniapp and test tooling"
```

### Task 2: Define Domain Types and Request Validation

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/validate.ts`
- Create: `src/core/__tests__/validate.test.ts`

- [ ] **Step 1: Write failing validation tests**

```ts
it("rejects mode1 request without target", () => {
  expect(() => validateRequest(reqWithoutTarget)).toThrow(/target/i);
});
```

- [ ] **Step 2: Run focused test and confirm FAIL**

Run: `npm test -- src/core/__tests__/validate.test.ts`
Expected: `validateRequest` missing or failing assertions.

- [ ] **Step 3: Implement minimal types + validator**

```ts
export function validateRequest(req: SolveRequest): SolveRequest {
  if (req.mode === "mode1_contact_paths" && !hasTarget(req.balls)) {
    throw new Error("mode1 requires target ball");
  }
  return withDefaults(req);
}
```

- [ ] **Step 4: Re-run tests and verify PASS**

Run: `npm test -- src/core/__tests__/validate.test.ts`
Expected: all validation tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/validate.ts src/core/__tests__/validate.test.ts
git commit -m "feat: add request types and validation defaults"
```

### Task 3: Implement Geometry and Collision Primitives

**Files:**
- Create: `src/core/geometry.ts`
- Create: `src/core/collision.ts`
- Create: `src/core/__tests__/geometry.test.ts`
- Create: `src/core/__tests__/collision.test.ts`

- [ ] **Step 1: Write failing tests for reflection and channel collision**

```ts
it("reflects angle on vertical cushion", () => {
  expect(reflect({ x: 1, y: 0.5 }, "vertical").x).toBeCloseTo(-1);
});
```

- [ ] **Step 2: Run focused tests and confirm FAIL**

Run: `npm test -- src/core/__tests__/geometry.test.ts src/core/__tests__/collision.test.ts`
Expected: missing exports or assertion failures.

- [ ] **Step 3: Implement primitive math**

```ts
export function segmentBlockedByBall(seg: Segment, ball: Ball, radius: number): boolean {
  const d = distancePointToSegment(ball.pos, seg.from, seg.to);
  return d < radius + ball.radius;
}
```

- [ ] **Step 4: Re-run tests and verify PASS**

Run: same command as step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/geometry.ts src/core/collision.ts src/core/__tests__/geometry.test.ts src/core/__tests__/collision.test.ts
git commit -m "feat: add geometry and collision primitives"
```

### Task 4: Build Mode1 Solver (2-5 Cushion Search)

**Files:**
- Create: `src/core/solvers/mode1.ts`
- Create: `src/core/__tests__/mode1.test.ts`
- Create: `fixtures/scenes/mode1-basic.json`
- Create: `fixtures/scenes/mode1-obstacle-blocked.json`

- [ ] **Step 1: Write failing mode1 behavior tests**

```ts
it("returns only non-blocked candidates when possible", () => {
  const out = solveMode1(scene);
  expect(out.candidates.some((c) => c.blocked)).toBe(false);
});
```

- [ ] **Step 2: Run focused mode1 test and confirm FAIL**

Run: `npm test -- src/core/__tests__/mode1.test.ts`
Expected: solver missing or wrong output.

- [ ] **Step 3: Implement minimal mode1 solver pipeline**

```ts
const sequences = generateCushionSequences(min, max);
const candidates = sequences
  .map((seq) => buildCandidateFromMirror(seq, req))
  .map((c) => applyObstacleFilter(c, req.balls))
  .sort(rankCandidates);
```

- [ ] **Step 4: Re-run mode1 tests and verify PASS**

Run: `npm test -- src/core/__tests__/mode1.test.ts`
Expected: PASS with deterministic ordering.

- [ ] **Step 5: Commit**

```bash
git add src/core/solvers/mode1.ts src/core/__tests__/mode1.test.ts fixtures/scenes/mode1-*.json
git commit -m "feat: implement mode1 multi-cushion geometric solver"
```

### Task 5: Build Mode2 Directional Trajectory Solver

**Files:**
- Create: `src/core/solvers/mode2.ts`
- Create: `src/core/__tests__/mode2.test.ts`
- Create: `fixtures/scenes/mode2-direction.json`

- [ ] **Step 1: Write failing mode2 tests**

```ts
it("stops when first non-cue ball collision occurs", () => {
  const out = solveMode2(scene);
  expect(out.candidates[0].segments.at(-1)?.event).toBe("contact");
});
```

- [ ] **Step 2: Run focused mode2 test and confirm FAIL**

Run: `npm test -- src/core/__tests__/mode2.test.ts`
Expected: solver missing or incorrect termination.

- [ ] **Step 3: Implement minimal forward simulation**

```ts
for (let i = 0; i < maxBounces; i += 1) {
  const hit = findNextHit(state);
  appendSegment(hit);
  if (hit.event === "contact") break;
  state = reflectState(state, hit.normal);
}
```

- [ ] **Step 4: Re-run mode2 tests and verify PASS**

Run: `npm test -- src/core/__tests__/mode2.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/solvers/mode2.ts src/core/__tests__/mode2.test.ts fixtures/scenes/mode2-direction.json
git commit -m "feat: implement mode2 directional trajectory solver"
```

### Task 6: Wire Adapter + Mini Program UI

**Files:**
- Create: `src/core/adapter.ts`
- Modify: `miniprogram/pages/index/index.ts`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Create: `src/core/__tests__/adapter.test.ts`

- [ ] **Step 1: Write failing adapter routing tests**

```ts
it("routes mode1 requests to mode1 solver", () => {
  expect(solveShot(mode1Req).solver).toBe("local-geo");
});
```

- [ ] **Step 2: Run focused adapter test and confirm FAIL**

Run: `npm test -- src/core/__tests__/adapter.test.ts`
Expected: missing adapter export.

- [ ] **Step 3: Implement adapter and bind to page actions**

```ts
export function solveShot(req: SolveRequest): SolveResponse {
  validateRequest(req);
  return req.mode === "mode1_contact_paths" ? solveMode1(req) : solveMode2(req);
}
```

- [ ] **Step 4: Verify tests + manual miniapp flow**

Run: `npm test`
Manual Expected:
- Mode1: tap calculate shows candidate list + highlighted path.
- Mode2: tap calculate shows directional trajectory.

- [ ] **Step 5: Commit**

```bash
git add src/core/adapter.ts src/core/__tests__/adapter.test.ts miniprogram/pages/index/index.ts miniprogram/pages/index/index.wxml miniprogram/pages/index/index.wxss
git commit -m "feat: connect solvers to miniapp interaction UI"
```

### Task 7: Add Error UX, Regression Suite, and Docs

**Files:**
- Create: `src/core/__tests__/regression.test.ts`
- Modify: `miniprogram/pages/index/index.ts`
- Create: `README.md`

- [ ] **Step 1: Write failing regression test from fixture pack**

```ts
it("mode1 regression set stays stable", () => {
  expect(runMode1Regression()).toMatchObject({ pass: true });
});
```

- [ ] **Step 2: Run regression test and confirm FAIL**

Run: `npm test -- src/core/__tests__/regression.test.ts`
Expected: fixture harness missing.

- [ ] **Step 3: Implement fixture runner + UI error mapping**

```ts
if (!result.candidates.length) {
  this.setData({ errorText: "未找到可行线路，请减少库数或调整障碍球" });
}
```

- [ ] **Step 4: Full verification**

Run: `npm test && npm run lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/__tests__/regression.test.ts miniprogram/pages/index/index.ts README.md
git commit -m "chore: add regression suite, error UX, and usage docs"
```

## Verification Checklist (Before claiming completion)

- [ ] All test commands in each task executed and matched expected outcomes.
- [ ] Mode1 supports cushion range 2-5 and obstacle avoidance.
- [ ] Mode2 stops on first collision/threshold/timeout.
- [ ] UI triggers button-based compute for both modes.
- [ ] Response schema remains compatible with future `remote-physics` solver.

## Plan Review (local fallback)

Because this environment disallows spawning subagents unless explicitly requested by the user, run this local review loop:

1. `rg -n "TODO|TBD|FIXME" docs/superpowers/plans/2026-03-25-wechat-billiards-mvp-implementation-plan.md`
2. Validate every task has: exact files, failing test, run-fail, minimal impl, run-pass, commit.
3. If issues found, patch plan and re-run step 1-2 (max 3 iterations).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-03-25-wechat-billiards-mvp-implementation-plan.md`.

Two execution options:

1. Subagent-Driven (recommended)
2. Inline Execution

Which approach?
