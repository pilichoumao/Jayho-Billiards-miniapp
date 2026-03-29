import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { solveMode1 } from "../solvers/mode1";
import { solveMode2 } from "../solvers/mode2";
import type { Ball, CandidatePath, SolveRequest, SolveResponse } from "../types";
import { validateRequest } from "../validate";

function loadScene(name: string): SolveRequest {
  const raw = readFileSync(new URL(`../../../fixtures/scenes/${name}.json`, import.meta.url), "utf8");

  return validateRequest(JSON.parse(raw) as SolveRequest);
}

function candidateSignature(candidate: CandidatePath) {
  const lastSegment = candidate.segments[candidate.segments.length - 1];

  return {
    id: candidate.id,
    cushions: candidate.cushions,
    blocked: candidate.blocked,
    rejectReason: candidate.rejectReason,
    segments: candidate.segments.length,
    score: Number(candidate.score.toFixed(2)),
    travelDistance: Number(candidate.metrics.travelDistance.toFixed(3)),
    minClearance: Number(candidate.metrics.minClearance.toFixed(3)),
    lastEvent: lastSegment?.event
  };
}

function summarizeCandidate(candidate: CandidatePath) {
  return {
    id: candidate.id,
    score: candidate.score,
    cushions: candidate.cushions,
    blocked: candidate.blocked,
    rejectReason: candidate.rejectReason,
    segments: candidate.segments.map((segment) => ({
      event: segment.event,
      from: segment.from,
      to: segment.to
    })),
    metrics: candidate.metrics
  };
}

function summarizeResponse(response: SolveResponse) {
  return {
    solver: response.solver,
    candidates: response.candidates.map(summarizeCandidate)
  };
}

describe("fixture regression suite", () => {
  it("keeps mode1 fixture ordering stable and covers the expected cushion range", () => {
    const scene = loadScene("mode1-basic");

    const first = solveMode1(scene);
    const second = solveMode1(scene);

    expect(summarizeResponse(first)).toEqual(summarizeResponse(second));
    expect(first.solver).toBe("local-geo");
    expect(first.candidates.length).toBeGreaterThan(0);
    expect(first.candidates.some((candidate) => candidate.blocked)).toBe(false);
    expect([...new Set(first.candidates.map((candidate) => candidate.cushions))]).toEqual([2, 3, 4, 5]);
    expect(first.candidates.every((candidate) => candidate.cushions >= 2 && candidate.cushions <= 5)).toBe(true);
    expect(first.candidates[0]).toMatchObject({
      cushions: 2,
      blocked: false,
      rejectReason: undefined
    });
    expect(first.candidates[0].metrics.travelDistance).toBeGreaterThan(0);
    expect(first.candidates[0].metrics.travelDistance).toBeLessThan(10);
    expect(first.candidates[0].metrics.minClearance).toBeGreaterThanOrEqual(0);
    expect(first.candidates[0].segments[first.candidates[0].segments.length - 1]?.event).toBe("contact");
    expect(first.candidates[0].segments.some((segment) => segment.event === "cushion")).toBe(true);
    expect(first.candidates.slice(0, 2).map(candidateSignature)).toEqual([
      {
        id: "mode1-2-LT",
        cushions: 2,
        blocked: false,
        rejectReason: undefined,
        segments: 3,
        score: 997883.48,
        travelDistance: 1.167,
        minClearance: 0.02,
        lastEvent: "contact"
      },
      {
        id: "mode1-2-TR",
        cushions: 2,
        blocked: false,
        rejectReason: undefined,
        segments: 3,
        score: 997879.77,
        travelDistance: 1.227,
        minClearance: 0.252,
        lastEvent: "contact"
      }
    ]);
  });

  it("keeps mode1 blocked fixture deterministic and preserves reject reasons", () => {
    const scene = loadScene("mode1-obstacle-blocked");

    const first = solveMode1(scene);
    const second = solveMode1(scene);

    expect(summarizeResponse(first)).toEqual(summarizeResponse(second));
    expect(first.candidates.length).toBeGreaterThan(0);
    expect(first.candidates.every((candidate) => candidate.blocked)).toBe(true);
    expect(first.candidates.every((candidate) => candidate.rejectReason === "blocked by obstacle")).toBe(true);
    expect(first.candidates.every((candidate) => candidate.cushions >= 2 && candidate.cushions <= 5)).toBe(true);
    expect(first.candidates[0].metrics.travelDistance).toBeGreaterThan(0);
    expect(first.candidates[0].metrics.minClearance).toBeLessThanOrEqual(0);
    expect(first.candidates.slice(0, 2).map(candidateSignature)).toEqual([
      {
        id: "mode1-2-LT",
        cushions: 2,
        blocked: true,
        rejectReason: "blocked by obstacle",
        segments: 3,
        score: -1002121.54,
        travelDistance: 1.21,
        minClearance: -0.051,
        lastEvent: "contact"
      },
      {
        id: "mode1-2-TR",
        cushions: 2,
        blocked: true,
        rejectReason: "blocked by obstacle",
        segments: 3,
        score: -1002121.54,
        travelDistance: 1.21,
        minClearance: -0.051,
        lastEvent: "contact"
      }
    ]);
  });

  it("keeps mode2 cue-only fixture deterministic and rejects by travel-distance threshold", () => {
    const scene = loadScene("mode2-direction");

    const first = solveMode2(scene);
    const second = solveMode2(scene);

    expect(summarizeResponse(first)).toEqual(summarizeResponse(second));
    expect(first.solver).toBe("local-geo");
    expect(first.candidates).toHaveLength(1);
    expect(first.candidates.map(candidateSignature)).toEqual([
      {
        id: "mode2-2-3",
        cushions: 2,
        blocked: false,
        rejectReason: "travel-distance-threshold",
        segments: 3,
        score: -1002240,
        travelDistance: 2.5,
        minClearance: 1,
        lastEvent: "end"
      }
    ]);
    expect(first.candidates[0].blocked).toBe(false);
    expect(first.candidates[0].rejectReason).toBe("travel-distance-threshold");
    expect(first.candidates[0].segments[0].event).toBe("start");
    expect(first.candidates[0].segments.some((segment) => segment.event === "contact")).toBe(false);
    expect(first.candidates[0].metrics.travelDistance).toBeCloseTo(2.5, 6);
  });

  it("keeps mode2 timeout and threshold semantics stable", () => {
    const scene = loadScene("mode2-direction");
    const thresholdScene = {
      ...scene,
      balls: scene.balls.filter((ball) => ball.role === "cue")
    };

    const thresholdResult = solveMode2(thresholdScene);
    const timeoutResult = solveMode2({
      ...scene,
      constraints: {
        ...scene.constraints,
        timeoutMs: 0
      }
    });

    expect(thresholdResult.candidates).toHaveLength(1);
    expect(thresholdResult.candidates[0].rejectReason).toBe("travel-distance-threshold");
    expect(thresholdResult.candidates[0].segments.some((segment) => segment.event === "contact")).toBe(false);
    expect(thresholdResult.candidates[0].metrics.travelDistance).toBeCloseTo(2.5, 6);

    expect(timeoutResult.candidates).toHaveLength(1);
    expect(timeoutResult.candidates[0].rejectReason).toBe("timeout");
    expect(timeoutResult.candidates[0].segments).toHaveLength(1);
    expect(timeoutResult.candidates[0].segments[0].event).toBe("start");
    expect(timeoutResult.candidates[0].metrics.travelDistance).toBe(0);
  });
});

describe("index page error mapping", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  function installIndexPage(solveShot: ReturnType<typeof vi.fn>) {
    const pageOptions: Array<Record<string, unknown>> = [];

    (globalThis as typeof globalThis & { Page?: (_options: Record<string, unknown>) => void }).Page = (
      options: Record<string, unknown>
    ) => {
      pageOptions.push(options);
    };

    vi.doMock("../../../miniprogram/core/adapter", () => ({
      solveShot
    }));

    return {
      importPage: async () => {
        await import("../../../miniprogram/pages/index/index.ts");

        const options = pageOptions[0] as Record<string, unknown> | undefined;
        expect(options).toBeDefined();

        return options as Record<string, unknown>;
      }
    };
  }

  function createPageHarness<TData extends Record<string, unknown>>(data: TData) {
    const page = {
      data: JSON.parse(JSON.stringify(data)) as TData,
      setData: vi.fn((patch: Partial<TData>) => {
        Object.assign(page.data, patch);
      })
    };

    return page;
  }

  it("shows a friendly error when the solver returns no candidates", async () => {
    const solveShot = vi.fn().mockReturnValue({
      solver: "local-geo",
      elapsedMs: 4,
      candidates: []
    });

    const { importPage } = installIndexPage(solveShot);
    const options = await importPage();
    const handleCalculate = (options as { handleCalculate: () => void }).handleCalculate;

    const page = createPageHarness((options as { data: Record<string, unknown> }).data);
    // Ensure mode1 is selected for deterministic request composition.
    (page.data as Record<string, unknown>).mode = "mode1_contact_paths";
    handleCalculate.call(page);

    expect(solveShot).toHaveBeenCalledTimes(1);
    expect(page.setData).toHaveBeenCalledWith(
      expect.objectContaining({
        resultTitle: "",
        resultLines: [],
        errorText: "未找到可用结果，请调整参数后重试。"
      })
    );
  });

  it("shows a friendly error when every candidate is unusable", async () => {
    const blockedScene = loadScene("mode1-obstacle-blocked");
    const blockedResult = solveMode1(blockedScene);
    const solveShot = vi.fn().mockReturnValue(blockedResult);

    const { importPage } = installIndexPage(solveShot);
    const options = await importPage();
    const handleCalculate = (options as { handleCalculate: () => void }).handleCalculate;

    const page = createPageHarness((options as { data: Record<string, unknown> }).data);
    (page.data as Record<string, unknown>).mode = "mode1_contact_paths";
    handleCalculate.call(page);

    expect(solveShot).toHaveBeenCalledTimes(1);
    expect(page.setData).toHaveBeenCalledWith(
      expect.objectContaining({
        resultTitle: "",
        resultLines: [],
        errorText: "未找到可用结果，请调整参数后重试。"
      })
    );
  });

  it("separates edit and solve state: dragging does not call solveShot and keeps previous solve overlay until calculate", async () => {
    const mode1Scene = loadScene("mode1-basic");
    const solveShot = vi.fn().mockReturnValue(solveMode1(mode1Scene));

    const { importPage } = installIndexPage(solveShot);
    const options = await importPage();

    const handleCalculate = (options as { handleCalculate: () => void }).handleCalculate;
    const handleBallDragStart = (options as { handleBallDragStart: (_event: unknown) => void }).handleBallDragStart;
    const handleBallDragMove = (options as { handleBallDragMove: (_event: unknown) => void }).handleBallDragMove;
    const handleBallDragEnd = (options as { handleBallDragEnd: (_event: unknown) => void }).handleBallDragEnd;

    const page = createPageHarness((options as { data: Record<string, unknown> }).data);
    (page.data as Record<string, unknown>).mode = "mode1_contact_paths";
    // Provide a stage rect so touch -> table mapping is deterministic in tests.
    (page.data as Record<string, unknown>).tableStageRectPx = { left: 0, top: 0, width: 100, height: 100 };

    handleCalculate.call(page);
    expect(solveShot).toHaveBeenCalledTimes(1);

    const previousSolveRenderModel = (page.data as Record<string, unknown>).solveRenderModel;
    const previousLines = (page.data as Record<string, unknown>).resultLines;

    handleBallDragStart.call(page, { currentTarget: { dataset: { ballId: "cue" } }, touches: [{ pageX: 10, pageY: 10 }] });
    handleBallDragMove.call(page, { touches: [{ pageX: 50, pageY: 70 }] });
    handleBallDragMove.call(page, { changedTouches: [{ pageX: 60, pageY: 20 }] });
    handleBallDragEnd.call(page, { changedTouches: [{ pageX: 60, pageY: 20 }] });

    expect(solveShot).toHaveBeenCalledTimes(1);
    expect((page.data as Record<string, unknown>).solveRenderModel).toBe(previousSolveRenderModel);
    expect((page.data as Record<string, unknown>).resultLines).toBe(previousLines);
  });

  it("mode changes update the edit model without calling solveShot", async () => {
    const solveShot = vi.fn().mockReturnValue({
      solver: "local-geo",
      elapsedMs: 1,
      candidates: []
    });

    const { importPage } = installIndexPage(solveShot);
    const options = await importPage();

    const handleModeChange = (options as { handleModeChange: (_event: unknown) => void }).handleModeChange;
    const page = createPageHarness((options as { data: Record<string, unknown> }).data);

    handleModeChange.call(page, { detail: { value: "mode2_cue_direction" } });

    expect(solveShot).not.toHaveBeenCalled();
    expect((page.data as Record<string, unknown>).mode).toBe("mode2_cue_direction");
    expect((page.data as Record<string, unknown>).editBalls).toEqual([
      { id: "cue", role: "cue", pos: { x: 0.2, y: 0.4 }, radius: 0.028 }
    ]);
    const cueDirection = (page.data as Record<string, unknown>).cueDirection as { x: number; y: number } | undefined;
    expect(cueDirection).toBeDefined();
    expect(Math.hypot(cueDirection?.x ?? 0, cueDirection?.y ?? 0)).toBeCloseTo(1, 6);
  });

  it("direction dragging only updates cueDirection and keeps it normalized", async () => {
    const mode2Scene = loadScene("mode2-direction");
    const solveShot = vi.fn().mockReturnValue(solveMode2(mode2Scene));

    const { importPage } = installIndexPage(solveShot);
    const options = await importPage();

    const handleModeChange = (options as { handleModeChange: (_event: unknown) => void }).handleModeChange;
    const handleCueDirectionDragStart = (options as { handleCueDirectionDragStart: (_event: unknown) => void })
      .handleCueDirectionDragStart;
    const handleCueDirectionDragMove = (options as { handleCueDirectionDragMove: (_event: unknown) => void })
      .handleCueDirectionDragMove;
    const handleCueDirectionDragEnd = (options as { handleCueDirectionDragEnd: (_event: unknown) => void })
      .handleCueDirectionDragEnd;

    const page = createPageHarness((options as { data: Record<string, unknown> }).data);

    handleModeChange.call(page, { detail: { value: "mode2_cue_direction" } });
    (page.data as Record<string, unknown>).tableStageRectPx = { left: 0, top: 0, width: 100, height: 100 };

    const before = page.data.cueDirection as { x: number; y: number };
    handleCueDirectionDragStart.call(page, { touches: [{ pageX: 40, pageY: 80 }] });
    handleCueDirectionDragMove.call(page, { touches: [{ pageX: 60, pageY: 90 }] });
    handleCueDirectionDragEnd.call(page, { changedTouches: [{ pageX: 60, pageY: 90 }] });

    expect(solveShot).not.toHaveBeenCalled();
    const after = page.data.cueDirection as { x: number; y: number };
    expect(after).not.toEqual(before);
    expect(Math.hypot(after.x, after.y)).toBeCloseTo(1, 6);
  });

  it("handleCalculate uses current cue-only balls and the normalized cueDirection", async () => {
    const solveShot = vi.fn().mockReturnValue({
      solver: "local-geo",
      elapsedMs: 5,
      candidates: [
        {
          id: "mode2-valid",
          score: 12.34,
          cushions: 1,
          blocked: false,
          segments: [
            { event: "start", from: { x: 0.2, y: 0.4 }, to: { x: 0.5, y: 0.7 } },
            { event: "contact", from: { x: 0.5, y: 0.7 }, to: { x: 0.6, y: 0.8 } }
          ],
          metrics: {
            travelDistance: 1.234,
            minClearance: 0.12
          }
        }
      ]
    } satisfies SolveResponse);

    const { importPage } = installIndexPage(solveShot);
    const options = await importPage();

    const handleModeChange = (options as { handleModeChange: (_event: unknown) => void }).handleModeChange;
    const handleCalculate = (options as { handleCalculate: () => void }).handleCalculate;
    const handleCueDirectionDragMove = (options as { handleCueDirectionDragMove: (_event: unknown) => void })
      .handleCueDirectionDragMove;

    const page = createPageHarness((options as { data: Record<string, unknown> }).data);

    handleModeChange.call(page, { detail: { value: "mode2_cue_direction" } });
    (page.data as Record<string, unknown>).tableStageRectPx = { left: 0, top: 0, width: 100, height: 100 };
    handleCueDirectionDragMove.call(page, { touches: [{ pageX: 60, pageY: 80 }] });

    handleCalculate.call(page);
    expect(solveShot).toHaveBeenCalledTimes(1);

    const request = solveShot.mock.calls[0]?.[0] as SolveRequest;
    expect(request.mode).toBe("mode2_cue_direction");
    expect(request.balls).toEqual([
      { id: "cue", role: "cue", pos: { x: 0.2, y: 0.4 }, radius: 0.028 }
    ]);
    expect(request.input.cueDirection).toEqual(page.data.cueDirection);
    expect(Math.hypot(request.input.cueDirection?.x ?? 0, request.input.cueDirection?.y ?? 0)).toBeCloseTo(1, 6);
    expect((page.data as Record<string, unknown>).resultLines).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Direction: /), "State: valid"])
    );
  });

  it("keeps the previous direction when the drag is below the near-zero threshold", async () => {
    const solveShot = vi.fn().mockReturnValue({
      solver: "local-geo",
      elapsedMs: 1,
      candidates: []
    });

    const { importPage } = installIndexPage(solveShot);
    const options = await importPage();

    const handleModeChange = (options as { handleModeChange: (_event: unknown) => void }).handleModeChange;
    const handleCueDirectionDragMove = (options as { handleCueDirectionDragMove: (_event: unknown) => void })
      .handleCueDirectionDragMove;
    const handleCalculate = (options as { handleCalculate: () => void }).handleCalculate;

    const page = createPageHarness((options as { data: Record<string, unknown> }).data);
    handleModeChange.call(page, { detail: { value: "mode2_cue_direction" } });
    (page.data as Record<string, unknown>).tableStageRectPx = { left: 0, top: 0, width: 100, height: 100 };

    const initialDirection = { ...(page.data as Record<string, unknown>).cueDirection as { x: number; y: number } };
    handleCueDirectionDragMove.call(page, { touches: [{ pageX: 20.5, pageY: 40.5 }] });

    expect((page.data as Record<string, unknown>).cueDirection).toEqual(initialDirection);

    handleCalculate.call(page);
    const request = solveShot.mock.calls[0]?.[0] as SolveRequest;
    expect(request.input.cueDirection).toEqual(initialDirection);
    expect(Math.hypot(request.input.cueDirection?.x ?? 0, request.input.cueDirection?.y ?? 0)).toBeCloseTo(1, 6);
  });

  it("mode2 summaries include direction, validity, and invalid reasons", async () => {
    const invalidResult: SolveResponse = {
      solver: "local-geo",
      elapsedMs: 7,
      candidates: [
        {
          id: "mode2-pocketed",
          score: -12,
          cushions: 1,
          blocked: true,
          rejectReason: "pocketed",
          segments: [
            { event: "start", from: { x: 0.2, y: 0.4 }, to: { x: 0.35, y: 0.55 } },
            { event: "end", from: { x: 0.35, y: 0.55 }, to: { x: 0.38, y: 0.58 } }
          ],
          metrics: {
            travelDistance: 0.75,
            minClearance: -0.01
          }
        }
      ]
    };
    const solveShot = vi.fn().mockReturnValue(invalidResult);

    const { importPage } = installIndexPage(solveShot);
    const options = await importPage();

    const handleModeChange = (options as { handleModeChange: (_event: unknown) => void }).handleModeChange;
    const handleCalculate = (options as { handleCalculate: () => void }).handleCalculate;

    const page = createPageHarness((options as { data: Record<string, unknown> }).data);
    handleModeChange.call(page, { detail: { value: "mode2_cue_direction" } });

    handleCalculate.call(page);

    expect((page.data as Record<string, unknown>).errorText).toBe("");
    expect((page.data as Record<string, unknown>).resultTitle).toBe("Mode 2 Result");
    expect((page.data as Record<string, unknown>).resultLines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Direction: /),
        "State: invalid",
        "Invalid reason: pocketed"
      ])
    );
    expect((page.data as Record<string, unknown>).solveRenderModel).toBeDefined();
  });

  it("switching candidates only updates selection state and does not re-run the solver", async () => {
    const mode1Scene = loadScene("mode1-basic");
    const solveShot = vi.fn().mockReturnValue(solveMode1(mode1Scene));

    const { importPage } = installIndexPage(solveShot);
    const options = await importPage();

    const handleCalculate = (options as { handleCalculate: () => void }).handleCalculate;
    const handleCandidateSelect = (options as { handleCandidateSelect: (_event: unknown) => void }).handleCandidateSelect;

    const page = createPageHarness((options as { data: Record<string, unknown> }).data);
    (page.data as Record<string, unknown>).mode = "mode1_contact_paths";

    handleCalculate.call(page);
    expect(solveShot).toHaveBeenCalledTimes(1);

    handleCandidateSelect.call(page, { currentTarget: { dataset: { candidateId: "mode1-2-TR" } } });

    expect(solveShot).toHaveBeenCalledTimes(1);
    expect((page.data as Record<string, unknown>).selectedCandidateId).toBe("mode1-2-TR");
  });

  it("drag handlers accept changedTouches[0] and touches[0] page coordinates", async () => {
    const mode1Scene = loadScene("mode1-basic");
    const solveShot = vi.fn().mockReturnValue(solveMode1(mode1Scene));

    const { importPage } = installIndexPage(solveShot);
    const options = await importPage();

    const handleBallDragStart = (options as { handleBallDragStart: (_event: unknown) => void }).handleBallDragStart;
    const handleBallDragMove = (options as { handleBallDragMove: (_event: unknown) => void }).handleBallDragMove;
    const handleBallDragEnd = (options as { handleBallDragEnd: (_event: unknown) => void }).handleBallDragEnd;

    const page = createPageHarness((options as { data: Record<string, unknown> }).data);
    (page.data as Record<string, unknown>).mode = "mode1_contact_paths";
    (page.data as Record<string, unknown>).tableStageRectPx = { left: 0, top: 0, width: 100, height: 100 };

    handleBallDragStart.call(page, { currentTarget: { dataset: { ballId: "cue" } }, touches: [{ pageX: 10, pageY: 10 }] });
    handleBallDragMove.call(page, { touches: [{ pageX: 25, pageY: 75 }] });
    handleBallDragMove.call(page, { changedTouches: [{ pageX: 50, pageY: 50 }] });
    handleBallDragEnd.call(page, { changedTouches: [{ pageX: 50, pageY: 50 }] });

    const editBalls = (page.data as Record<string, unknown>).editBalls as Ball[] | undefined;
    expect(editBalls).toBeDefined();
    expect(editBalls?.find((ball) => ball.id === "cue")?.pos).toMatchObject({ x: 0.5, y: 0.5 });
  });
});
