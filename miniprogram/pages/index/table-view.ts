import type { Ball, CandidatePath, PathSegment, SolveRequest, SolveResponse, Vec2 } from "../../core/types";

export type StageRectPx = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type StageGeometry = StageRectPx & {
  tableToStagePx(point: Vec2): Vec2;
  stagePxToTable(point: Vec2): Vec2;
};

export type PercentPosition = {
  left: string;
  top: string;
};

export type RouteMarker = {
  kind: "cushion" | "contact" | "end";
  point: Vec2;
  segmentIndex: number;
};

export type CandidateRenderModel = {
  request: SolveRequest;
  response: SolveResponse;
  selectedCandidateId?: string;
  selectedCandidate?: CandidatePath;
  routePoints: Vec2[];
  markers: RouteMarker[];
};

export function createStageGeometry(stage: StageRectPx): StageGeometry {
  return {
    ...stage,
    tableToStagePx(point) {
      return {
        x: stage.left + point.x * stage.width,
        y: stage.top + point.y * stage.height
      };
    },
    stagePxToTable(point) {
      return {
        x: stage.width === 0 ? 0 : (point.x - stage.left) / stage.width,
        y: stage.height === 0 ? 0 : (point.y - stage.top) / stage.height
      };
    }
  };
}

export function mapTablePointToPercent(point: Vec2): PercentPosition {
  return {
    left: formatPercent(point.x),
    top: formatPercent(point.y)
  };
}

export function mapStagePixelToTablePoint(stage: StageRectPx, pixel: Vec2): Vec2 {
  return createStageGeometry(stage).stagePxToTable(pixel);
}

export function mapTouchToTablePoint(stage: StageRectPx, touch: { pageX: number; pageY: number }): Vec2 {
  return mapStagePixelToTablePoint(stage, { x: touch.pageX, y: touch.pageY });
}

export function clampTablePointForBall(point: Vec2, ball: Pick<Ball, "radius">): Vec2 {
  const r = ball.radius;
  return {
    x: clamp(point.x, r, 1 - r),
    y: clamp(point.y, r, 1 - r)
  };
}

export function findCandidateById(result: Pick<SolveResponse, "candidates">, id: string | undefined): CandidatePath | undefined {
  if (!id) return undefined;
  return result.candidates.find((candidate) => candidate.id === id);
}

export function resolveSelectedCandidate(
  result: Pick<SolveResponse, "candidates">,
  requestedId?: string
): CandidatePath | undefined {
  const requested = findCandidateById(result, requestedId);
  if (requested) return requested;

  const feasible = result.candidates.find((candidate) => !candidate.blocked && !candidate.rejectReason);
  return feasible ?? result.candidates[0];
}

export function extractRoutePoints(segments: PathSegment[]): Vec2[] {
  if (segments.length === 0) return [];
  const points: Vec2[] = [{ ...segments[0].from }];
  for (const segment of segments) {
    points.push({ ...segment.to });
  }
  return points;
}

export function extractRouteMarkers(segments: PathSegment[]): RouteMarker[] {
  const markers: RouteMarker[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.event === "cushion" || segment.event === "contact") {
      markers.push({ kind: segment.event, point: { ...segment.to }, segmentIndex: i });
    }
  }

  const last = segments[segments.length - 1];
  if (last) {
    markers.push({ kind: "end", point: { ...last.to }, segmentIndex: segments.length - 1 });
  }

  return markers;
}

export function buildCandidateRenderModel(
  request: SolveRequest,
  response: SolveResponse,
  selectedCandidateId?: string
): CandidateRenderModel {
  const selectedCandidate = resolveSelectedCandidate(response, selectedCandidateId);
  const segments = selectedCandidate?.segments ?? [];

  return {
    request,
    response,
    selectedCandidateId: selectedCandidate?.id,
    selectedCandidate,
    routePoints: extractRoutePoints(segments),
    markers: extractRouteMarkers(segments)
  };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function formatPercent(value: number): string {
  const scaled = value * 100;

  if (!Number.isFinite(scaled)) {
    return "0%";
  }

  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) < 1e-10) {
    return `${rounded}%`;
  }

  return `${parseFloat(scaled.toFixed(3))}%`;
}

