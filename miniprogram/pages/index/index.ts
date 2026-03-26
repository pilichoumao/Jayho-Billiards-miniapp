import { solveShot } from "../../core/adapter";
import type { Ball, CandidatePath, SolveMode, SolveRequest, SolveResponse } from "../../core/types";
import type { StageRectPx } from "./table-view";
import { clampTablePointForBall, mapTouchToTablePoint, resolveSelectedCandidate } from "./table-view";

type IndexPageData = {
  mode: SolveMode;
  editBalls: Ball[];
  tableStageRectPx: StageRectPx;
  draggingBallId?: string;
  solveResult?: SolveResponse;
  selectedCandidateId?: string;
  resultTitle: string;
  resultLines: string[];
  errorText: string;
};

type ChangeEvent = {
  detail?: {
    value?: string;
  };
};

type PageInstance = {
  data: IndexPageData;
  setData(_data: Partial<IndexPageData>): void;
};

const NO_SOLUTION_TEXT = "未找到可用结果，请调整参数后重试。";
const DEFAULT_STAGE_RECT_PX: StageRectPx = { left: 0, top: 0, width: 1, height: 1 };

declare const Page: (_options: Record<string, unknown>) => void;
declare const wx: {
  createSelectorQuery(): {
    select(_selector: string): {
      boundingClientRect(_callback: (_rect: { left: number; top: number; width: number; height: number } | null) => void): {
        exec(_callback?: () => void): void;
      };
    };
  };
};

const MODE1_REQUEST: SolveRequest = {
  mode: "mode1_contact_paths",
  table: {
    width: 2.84,
    height: 1.42,
    pocketR: 0.06
  },
  balls: [
    {
      id: "cue",
      role: "cue",
      pos: { x: 0.18, y: 0.24 },
      radius: 0.028
    },
    {
      id: "target",
      role: "target",
      pos: { x: 0.78, y: 0.64 },
      radius: 0.028
    },
    {
      id: "obstacle-1",
      role: "obstacle",
      pos: { x: 0.47, y: 0.46 },
      radius: 0.028
    }
  ],
  constraints: {
    avoidObstacle: true,
    timeoutMs: 300,
    cushionMin: 2,
    cushionMax: 3
  },
  input: {}
};

const MODE2_REQUEST: SolveRequest = {
  mode: "mode2_cue_direction",
  table: {
    width: 2.84,
    height: 1.42,
    pocketR: 0.06
  },
  balls: [
    {
      id: "cue",
      role: "cue",
      pos: { x: 0.2, y: 0.4 },
      radius: 0.028
    },
    {
      id: "target",
      role: "target",
      pos: { x: 0.6, y: 0.514 },
      radius: 0.028
    }
  ],
  constraints: {
    avoidObstacle: true,
    timeoutMs: 2000
  },
  input: {
    cueDirection: { x: 1, y: 0.1 }
  }
};

Page({
  data: {
    mode: "mode1_contact_paths",
    editBalls: cloneBalls(MODE1_REQUEST.balls),
    tableStageRectPx: { ...DEFAULT_STAGE_RECT_PX },
    draggingBallId: undefined,
    solveResult: undefined,
    selectedCandidateId: undefined,
    resultTitle: "",
    resultLines: [],
    errorText: ""
  },

  onReady() {
    this.syncStageRect();
  },

  syncStageRect() {
    const page = this as PageInstance;
    const query = wx?.createSelectorQuery?.();
    if (!query) return;

    query
      .select("#table-stage")
      .boundingClientRect((rect) => {
        if (!rect) return;

        page.setData({
          tableStageRectPx: {
            left: rect.left ?? 0,
            top: rect.top ?? 0,
            width: rect.width ?? DEFAULT_STAGE_RECT_PX.width,
            height: rect.height ?? DEFAULT_STAGE_RECT_PX.height
          }
        });
      })
      .exec();
  },

  handleModeChange(event: ChangeEvent) {
    const page = this as PageInstance;
    const nextMode = event.detail?.value === "mode2_cue_direction" ? "mode2_cue_direction" : "mode1_contact_paths";

    page.setData({
      mode: nextMode,
      editBalls: cloneBalls(getModeTemplate(nextMode).balls),
      draggingBallId: undefined,
      solveResult: undefined,
      selectedCandidateId: undefined,
      resultTitle: "",
      resultLines: [],
      errorText: ""
    });
  },

  handleCalculate() {
    const page = this as PageInstance;

    try {
      const request = createRequest(page.data.mode, page.data.editBalls);
      const result = solveShot(request);

      if (!hasUsableCandidate(result)) {
        page.setData({
          solveResult: undefined,
          selectedCandidateId: undefined,
          resultTitle: "",
          resultLines: [],
          errorText: NO_SOLUTION_TEXT
        });

        return;
      }

      const selectedCandidate = resolveSelectedCandidate(result, page.data.selectedCandidateId);
      const selectedCandidateId = selectedCandidate?.id;
      const summary = summarizeResult(page.data.mode, result, selectedCandidateId);

      page.setData({
        solveResult: result,
        selectedCandidateId,
        resultTitle: summary.title,
        resultLines: summary.lines,
        errorText: ""
      });
    } catch (error) {
      page.setData({
        solveResult: undefined,
        selectedCandidateId: undefined,
        resultTitle: "",
        resultLines: [],
        errorText: error instanceof Error ? error.message : "Calculation failed"
      });
    }
  },

  handleCandidateSelect(event: { detail?: { value?: string }; currentTarget?: { dataset?: Record<string, unknown> } }) {
    const page = this as PageInstance;
    const nextId =
      (typeof event.detail?.value === "string" && event.detail.value) ||
      (typeof event.currentTarget?.dataset?.candidateId === "string" && event.currentTarget.dataset.candidateId) ||
      undefined;

    if (!nextId) return;

    const result = page.data.solveResult;
    if (!result) {
      page.setData({ selectedCandidateId: nextId });
      return;
    }

    const summary = summarizeResult(page.data.mode, result, nextId);
    page.setData({
      selectedCandidateId: nextId,
      resultTitle: summary.title,
      resultLines: summary.lines
    });
  },

  handleBallDragStart(event: {
    currentTarget?: { dataset?: Record<string, unknown> };
    touches?: Array<{ pageX: number; pageY: number }>;
    changedTouches?: Array<{ pageX: number; pageY: number }>;
  }) {
    const page = this as PageInstance;
    const ballId = typeof event.currentTarget?.dataset?.ballId === "string" ? event.currentTarget.dataset.ballId : undefined;
    if (!ballId) return;

    page.setData({
      draggingBallId: ballId
    });

    const touch = extractTouch(event);
    if (touch) {
      applyBallDrag(page, touch);
    }
  },

  handleBallDragMove(event: { touches?: Array<{ pageX: number; pageY: number }>; changedTouches?: Array<{ pageX: number; pageY: number }> }) {
    const page = this as PageInstance;
    const touch = extractTouch(event);
    if (!touch) return;
    applyBallDrag(page, touch);
  },

  handleBallDragEnd(_event: unknown) {
    const page = this as PageInstance;
    if (!page.data.draggingBallId) return;
    page.setData({ draggingBallId: undefined });
  }
});

function getModeTemplate(mode: SolveMode): SolveRequest {
  return mode === "mode1_contact_paths" ? MODE1_REQUEST : MODE2_REQUEST;
}

function createRequest(mode: SolveMode, editBalls: Ball[]): SolveRequest {
  const source = getModeTemplate(mode);
  const balls = editBalls.length > 0 ? editBalls : source.balls;

  return {
    ...source,
    table: { ...source.table },
    constraints: { ...source.constraints },
    input: source.input.cueDirection ? { cueDirection: { ...source.input.cueDirection } } : {},
    balls: balls.map((ball) => ({
      ...ball,
      pos: { ...ball.pos }
    }))
  };
}

function hasUsableCandidate(result: SolveResponse): boolean {
  return result.candidates.some((candidate) => !candidate.blocked && !candidate.rejectReason);
}

function summarizeResult(mode: SolveMode, result: SolveResponse, selectedCandidateId?: string): { title: string; lines: string[] } {
  const lines = [`Candidates: ${result.candidates.length}`, `Solver: ${result.solver}`, `Elapsed: ${result.elapsedMs} ms`];
  const selectedCandidate = resolveSelectedCandidate(result, selectedCandidateId) ?? result.candidates[0];

  if (selectedCandidate) {
    lines.push(...summarizeCandidate(selectedCandidate));
  } else {
    lines.push("No candidate paths returned.");
  }

  return {
    title: mode === "mode1_contact_paths" ? "Mode 1 Result" : "Mode 2 Result",
    lines
  };
}

function summarizeCandidate(candidate: CandidatePath): string[] {
  const lastSegment = candidate.segments[candidate.segments.length - 1];

  return [
    `First: ${candidate.id}`,
    `Cushions: ${candidate.cushions} | Score: ${candidate.score.toFixed(2)}`,
    `Travel: ${candidate.metrics.travelDistance.toFixed(3)} | Clearance: ${candidate.metrics.minClearance.toFixed(3)}`,
    `Last event: ${lastSegment ? lastSegment.event : "none"}`,
    `Reject reason: ${candidate.rejectReason ?? "none"}`
  ];
}

function cloneBalls(balls: Ball[]): Ball[] {
  return balls.map((ball) => ({
    ...ball,
    pos: { ...ball.pos }
  }));
}

function extractTouch(event: {
  touches?: Array<{ pageX: number; pageY: number }>;
  changedTouches?: Array<{ pageX: number; pageY: number }>;
}): { pageX: number; pageY: number } | undefined {
  const candidate = event.changedTouches?.[0] ?? event.touches?.[0];
  if (!candidate) return undefined;
  if (!Number.isFinite(candidate.pageX) || !Number.isFinite(candidate.pageY)) return undefined;
  return { pageX: candidate.pageX, pageY: candidate.pageY };
}

function applyBallDrag(page: PageInstance, touch: { pageX: number; pageY: number }): void {
  const draggingBallId = page.data.draggingBallId;
  if (!draggingBallId) return;

  const stage = page.data.tableStageRectPx ?? DEFAULT_STAGE_RECT_PX;
  const nextBalls = cloneBalls(page.data.editBalls);
  const index = nextBalls.findIndex((ball) => ball.id === draggingBallId);
  if (index < 0) return;

  const ball = nextBalls[index];
  const rawPoint = mapTouchToTablePoint(stage, touch);
  const clamped = clampTablePointForBall(rawPoint, ball);
  nextBalls[index] = {
    ...ball,
    pos: { ...clamped }
  };

  // Intentionally do not clear `solveResult` or re-run the solver. The overlay remains
  // until the next explicit calculate.
  page.setData({
    editBalls: nextBalls
  });
}
