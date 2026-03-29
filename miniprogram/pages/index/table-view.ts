import type { Ball, CandidatePath, PathSegment, SolveRequest, SolveResponse, Table, Vec2 } from "../../core/types";

export type StageRectPx = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type StageGeometry = StageRectPx & {
  tableToStagePx(_point: Vec2): Vec2;
  stagePxToTable(_point: Vec2): Vec2;
};

export type PercentPosition = {
  left: string;
  top: string;
};

export type PocketAnchor = {
  id: string;
  point: Vec2;
};

export type RouteMarker = {
  id: string;
  kind: "cushion" | "contact" | "end";
  point: Vec2;
  segmentIndex: number;
};

export type RouteLineSegment = {
  id: string;
  kind: PathSegment["event"];
  from: Vec2;
  to: Vec2;
  left: string;
  top: string;
  width: string;
  angleDeg: number;
};

export type RouteArrow = {
  id: string;
  point: Vec2;
  left: string;
  top: string;
  angleDeg: number;
};

export type CandidateRenderModel = {
  request: SolveRequest;
  response: SolveResponse;
  selectedCandidateId?: string;
  selectedCandidate?: CandidatePath;
  routePoints: Vec2[];
  routeSegments: RouteLineSegment[];
  routeArrow?: RouteArrow;
  markers: RouteMarker[];
  pocketAnchors: PocketAnchor[];
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

export function createPocketAnchors(): PocketAnchor[] {
  return [
    { id: "top-left", point: { x: 0, y: 0 } },
    { id: "top-middle", point: { x: 0.5, y: 0 } },
    { id: "top-right", point: { x: 1, y: 0 } },
    { id: "bottom-left", point: { x: 0, y: 1 } },
    { id: "bottom-middle", point: { x: 0.5, y: 1 } },
    { id: "bottom-right", point: { x: 1, y: 1 } }
  ];
}

export function mapTouchToTablePoint(
  stage: StageRectPx,
  touch: { clientX?: number; clientY?: number; pageX?: number; pageY?: number }
): Vec2 {
  const x = touch.clientX ?? touch.pageX ?? 0;
  const y = touch.clientY ?? touch.pageY ?? 0;

  return mapStagePixelToTablePoint(stage, { x, y });
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
  if (requested && !requested.blocked && !requested.rejectReason) return requested;

  return result.candidates.find((candidate) => !candidate.blocked && !candidate.rejectReason);
}

export function extractRoutePoints(segments: PathSegment[]): Vec2[] {
  if (segments.length === 0) return [];
  const points: Vec2[] = [{ ...segments[0].from }];
  for (const segment of segments) {
    points.push({ ...segment.to });
  }
  return points;
}

export function extractRouteLineSegments(segments: PathSegment[], table: Pick<Table, "width" | "height">): RouteLineSegment[] {
  const yScale = getVisualYScale(table);

  return segments.map((segment, index) => {
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const visualDy = dy * yScale;

    return {
      id: `${index}-${segment.event}`,
      kind: segment.event,
      from: { ...segment.from },
      to: { ...segment.to },
      left: formatPercent(segment.from.x),
      top: formatPercent(segment.from.y),
      width: formatPercent(Math.hypot(dx, visualDy)),
      angleDeg: toDegrees(Math.atan2(visualDy, dx))
    };
  });
}

export function extractRouteArrow(segments: PathSegment[], table: Pick<Table, "width" | "height">): RouteArrow | undefined {
  const last = segments[segments.length - 1];
  if (!last) return undefined;

  const dx = last.to.x - last.from.x;
  const dy = last.to.y - last.from.y;
  const visualDy = dy * getVisualYScale(table);

  return {
    id: `${segments.length - 1}-arrow`,
    point: { ...last.to },
    left: formatPercent(last.to.x),
    top: formatPercent(last.to.y),
    angleDeg: toDegrees(Math.atan2(visualDy, dx))
  };
}

export function extractRouteMarkers(segments: PathSegment[]): RouteMarker[] {
  const markers: RouteMarker[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.event === "cushion" || segment.event === "contact") {
      markers.push({ id: `${i}-${segment.event}`, kind: segment.event, point: { ...segment.to }, segmentIndex: i });
    }
  }

  const last = segments[segments.length - 1];
  if (last) {
    markers.push({ id: `${segments.length - 1}-end`, kind: "end", point: { ...last.to }, segmentIndex: segments.length - 1 });
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
    routeSegments: extractRouteLineSegments(segments, request.table),
    routeArrow: extractRouteArrow(segments, request.table),
    markers: extractRouteMarkers(segments),
    pocketAnchors: createPocketAnchors()
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

function toDegrees(radians: number): number {
  return Math.round((radians * 180) / Math.PI * 1000) / 1000;
}

function getVisualYScale(table: Pick<Table, "width" | "height">): number {
  if (table.width === 0) {
    return 1;
  }

  return table.height / table.width;
}
