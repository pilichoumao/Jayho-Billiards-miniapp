import { solveShot } from "../../core/adapter";
import type { Ball, CandidatePath, SolveMode, SolveRequest, SolveResponse } from "../../core/types";
import type { StageRectPx } from "./table-view";
import {
  buildCandidateRenderModel,
  clampTablePointForBall,
  extractRouteMarkers,
  extractRoutePoints,
  findCandidateById,
  mapTouchToTablePoint,
  resolveSelectedCandidate
} from "./table-view";

type IndexPageData = {
  mode: SolveMode;
  editBalls: Ball[];
  cueDirection?: { x: number; y: number };
  tableStageRectPx: StageRectPx;
  draggingBallId?: string;
  solveRenderModel?: ReturnType<typeof buildCandidateRenderModel>;
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

type WxLike = {
  createSelectorQuery(): {
    select(_selector: string): {
      boundingClientRect(_callback: (_rect: { left: number; top: number; width: number; height: number } | null) => void): {
        exec(_callback?: () => void): void;
      };
    };
  };
};

const NO_SOLUTION_TEXT = "未找到可用结果，请调整参数后重试。";
const DEFAULT_STAGE_RECT_PX: StageRectPx = { left: 0, top: 0, width: 1, height: 1 };

declare const Page: (_options: Record<string, unknown>) => void;

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

const MODE2_INITIAL_DIRECTION = normalizeVector(MODE2_REQUEST.input.cueDirection ?? { x: 1, y: 0 });

Page({
  data: {
    mode: "mode1_contact_paths",
    editBalls: cloneBalls(MODE1_REQUEST.balls),
    cueDirection: undefined,
    tableStageRectPx: { ...DEFAULT_STAGE_RECT_PX },
    draggingBallId: undefined,
    solveRenderModel: undefined,
    selectedCandidateId: undefined,
    resultTitle: "",
    resultLines: [],
    errorText: ""
  },

  onReady() {
    this.syncStageRect();
  },

  onResize() {
    this.syncStageRect();
  },

  syncStageRect() {
    const page = this as PageInstance;
    const wxApi = (globalThis as typeof globalThis & { wx?: WxLike }).wx;
    const query = wxApi?.createSelectorQuery?.();
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
      cueDirection: nextMode === "mode2_cue_direction" ? { ...MODE2_INITIAL_DIRECTION } : undefined,
      draggingBallId: undefined,
      solveRenderModel: undefined,
      selectedCandidateId: undefined,
      resultTitle: "",
      resultLines: [],
      errorText: ""
    });
  },

  handleCalculate() {
    const page = this as PageInstance;

    try {
      const request = createRequest(page.data.mode, page.data.editBalls, page.data.cueDirection);
      const result = solveShot(request);
      const displayCandidate = resolveDisplayCandidate(page.data.mode, result, page.data.selectedCandidateId);

      if (!displayCandidate) {
        page.setData({
          solveRenderModel: undefined,
          selectedCandidateId: undefined,
          resultTitle: "",
          resultLines: [],
          errorText: NO_SOLUTION_TEXT
        });

        return;
      }

      const summary = summarizeResult(page.data.mode, result, displayCandidate.id, request.input.cueDirection);
      const solveRenderModel = buildSolveRenderModel(request, result, displayCandidate);

      page.setData({
        solveRenderModel,
        selectedCandidateId: displayCandidate.id,
        resultTitle: summary.title,
        resultLines: summary.lines,
        errorText: ""
      });
    } catch (error) {
      page.setData({
        solveRenderModel: undefined,
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

    const result = page.data.solveRenderModel?.response;
    if (!result) {
      page.setData({ selectedCandidateId: nextId });
      return;
    }

    const resolvedCandidate = resolveDisplayCandidate(page.data.mode, result, nextId);
    if (!resolvedCandidate) {
      page.setData({ selectedCandidateId: nextId });
      return;
    }

    const solveRequest = page.data.solveRenderModel?.request ?? createRequest(page.data.mode, page.data.editBalls);
    const summary = summarizeResult(page.data.mode, result, resolvedCandidate.id, solveRequest.input.cueDirection);
    const solveRenderModel = buildSolveRenderModel(solveRequest, result, resolvedCandidate);
    page.setData({
      selectedCandidateId: resolvedCandidate.id,
      solveRenderModel,
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
  },

  handleCueDirectionDragStart(event: { touches?: Array<{ pageX: number; pageY: number }>; changedTouches?: Array<{ pageX: number; pageY: number }> }) {
    const page = this as PageInstance;
    const touch = extractTouch(event);
    if (!touch) return;
    applyCueDirectionDrag(page, touch);
  },

  handleCueDirectionDragMove(event: { touches?: Array<{ pageX: number; pageY: number }>; changedTouches?: Array<{ pageX: number; pageY: number }> }) {
    const page = this as PageInstance;
    const touch = extractTouch(event);
    if (!touch) return;
    applyCueDirectionDrag(page, touch);
  },

  handleCueDirectionDragEnd(_event: unknown) {
    return;
  }
});

function getModeTemplate(mode: SolveMode): SolveRequest {
  return mode === "mode1_contact_paths" ? MODE1_REQUEST : MODE2_REQUEST;
}

function createRequest(mode: SolveMode, editBalls: Ball[], cueDirection?: { x: number; y: number }): SolveRequest {
  const source = getModeTemplate(mode);
  const balls = editBalls;
  const input = { ...source.input };

  if (mode === "mode2_cue_direction") {
    input.cueDirection = normalizeVector(cueDirection ?? source.input.cueDirection ?? MODE2_INITIAL_DIRECTION);
  }

  return {
    ...source,
    table: { ...source.table },
    constraints: { ...source.constraints },
    input,
    balls: balls.map((ball) => ({
      ...ball,
      pos: { ...ball.pos }
    }))
  };
}

function resolveDisplayCandidate(
  mode: SolveMode,
  result: SolveResponse,
  selectedCandidateId?: string
): CandidatePath | undefined {
  const requestedCandidate = findCandidateById(result, selectedCandidateId);
  if (requestedCandidate && isDisplayCandidate(mode, requestedCandidate)) {
    return requestedCandidate;
  }

  const usableCandidate = resolveSelectedCandidate(result, selectedCandidateId);
  if (usableCandidate) {
    return usableCandidate;
  }

  if (mode === "mode2_cue_direction") {
    return result.candidates.find((candidate) => candidate.rejectReason === "pocketed");
  }

  return undefined;
}

function isDisplayCandidate(mode: SolveMode, candidate: CandidatePath): boolean {
  return isUsableCandidate(candidate) || (mode === "mode2_cue_direction" && candidate.rejectReason === "pocketed");
}

function isUsableCandidate(candidate: CandidatePath): boolean {
  return !candidate.blocked && !candidate.rejectReason;
}

function buildSolveRenderModel(
  request: SolveRequest,
  response: SolveResponse,
  candidate: CandidatePath
): ReturnType<typeof buildCandidateRenderModel> {
  if (isUsableCandidate(candidate)) {
    return buildCandidateRenderModel(request, response, candidate.id);
  }

  return {
    request,
    response,
    selectedCandidateId: candidate.id,
    selectedCandidate: candidate,
    routePoints: extractRoutePoints(candidate.segments),
    markers: extractRouteMarkers(candidate.segments)
  };
}

function summarizeResult(
  mode: SolveMode,
  result: SolveResponse,
  selectedCandidateId?: string,
  cueDirection?: { x: number; y: number }
): { title: string; lines: string[] } {
  const lines = [`Candidates: ${result.candidates.length}`, `Solver: ${result.solver}`, `Elapsed: ${result.elapsedMs} ms`];
  const selectedCandidate = resolveDisplayCandidate(mode, result, selectedCandidateId);

  if (selectedCandidate) {
    lines.push(...summarizeCandidate(mode, selectedCandidate, cueDirection));
  } else {
    lines.push("No candidate paths returned.");
  }

  return {
    title: mode === "mode1_contact_paths" ? "Mode 1 Result" : "Mode 2 Result",
    lines
  };
}

function summarizeCandidate(mode: SolveMode, candidate: CandidatePath, cueDirection?: { x: number; y: number }): string[] {
  const lastSegment = candidate.segments[candidate.segments.length - 1];
  const valid = isUsableCandidate(candidate);

  const lines = [
    `First: ${candidate.id}`,
    ...(mode === "mode2_cue_direction" && cueDirection ? [`Direction: ${formatDirection(cueDirection)}`] : []),
    ...(mode === "mode2_cue_direction" ? [`State: ${valid ? "valid" : "invalid"}`] : []),
    `Cushions: ${candidate.cushions} | Score: ${candidate.score.toFixed(2)}`,
    `Travel: ${candidate.metrics.travelDistance.toFixed(3)} | Clearance: ${candidate.metrics.minClearance.toFixed(3)}`,
    `Last event: ${lastSegment ? lastSegment.event : "none"}`
  ];

  if (mode === "mode2_cue_direction") {
    if (!valid && candidate.rejectReason) {
      lines.push(`Invalid reason: ${candidate.rejectReason}`);
    }
  } else {
    lines.push(`Reject reason: ${candidate.rejectReason ?? "none"}`);
  }

  return lines;
}

function cloneBalls(balls: Ball[]): Ball[] {
  return balls.map((ball) => ({
    ...ball,
    pos: { ...ball.pos }
  }));
}

function extractTouch(event: {
  touches?: Array<{ clientX?: number; clientY?: number; pageX?: number; pageY?: number }>;
  changedTouches?: Array<{ clientX?: number; clientY?: number; pageX?: number; pageY?: number }>;
}): { clientX: number; clientY: number } | undefined {
  const candidate = event.changedTouches?.[0] ?? event.touches?.[0];
  if (!candidate) return undefined;

  const clientX = candidate.clientX ?? candidate.pageX;
  const clientY = candidate.clientY ?? candidate.pageY;

  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return undefined;
  return { clientX, clientY };
}

function applyBallDrag(page: PageInstance, touch: { clientX: number; clientY: number }): void {
  const draggingBallId = page.data.draggingBallId;
  if (!draggingBallId) return;

  const stage = page.data.tableStageRectPx ?? DEFAULT_STAGE_RECT_PX;
  if (stage.width <= 1 || stage.height <= 1) return;

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

  // Intentionally do not clear the solve render model or re-run the solver. The overlay remains
  // until the next explicit calculate.
  page.setData({
    editBalls: nextBalls
  });
}

function applyCueDirectionDrag(page: PageInstance, touch: { clientX: number; clientY: number }): void {
  const stage = page.data.tableStageRectPx ?? DEFAULT_STAGE_RECT_PX;
  if (stage.width <= 1 || stage.height <= 1) return;

  const cueBall = page.data.editBalls.find((ball) => ball.role === "cue");
  if (!cueBall) return;

  const rawPoint = mapTouchToTablePoint(stage, touch);
  const dx = rawPoint.x - cueBall.pos.x;
  const dy = rawPoint.y - cueBall.pos.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.02) return;

  page.setData({
    cueDirection: normalizeVector({ x: dx, y: dy })
  });
}

function normalizeVector(vector: { x: number; y: number }): { x: number; y: number } {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length) || length === 0) {
    return { x: 1, y: 0 };
  }

  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function formatDirection(direction: { x: number; y: number }): string {
  return `${direction.x.toFixed(3)}, ${direction.y.toFixed(3)}`;
}
