import { distancePointToSegment, segment, segmentLength } from "../geometry";
import type { Ball, CandidatePath, PathSegment, SolveRequest, SolveResponse, Vec2 } from "../types";

type CushionSide = "left" | "right" | "top" | "bottom";
type RejectReason = "timeout" | "travel-distance-threshold";

type RayHit =
  | {
      kind: "ball";
      t: number;
      point: Vec2;
    }
  | {
      kind: "cushion";
      t: number;
      point: Vec2;
      side: CushionSide;
    };

const EPSILON = 1e-9;
const MAX_BOUNCES = 16;
const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_MAX_TRAVEL_DISTANCE = 2.5;
const DEFAULT_MIN_CLEARANCE = 1;

export function solveMode2(req: SolveRequest): SolveResponse {
  if (req.mode !== "mode2_cue_direction") {
    throw new Error("solveMode2 requires mode2_cue_direction request");
  }

  const startedAt = Date.now();
  const cue = getBall(req.balls, "cue");
  const cueDirection = getCueDirection(req);
  const direction = normalize(cueDirection);
  const timeoutMs = req.constraints.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const candidate = simulateTrajectory({
    cue,
    initialDirection: direction,
    balls: req.balls.filter((ball) => ball.role !== "cue"),
    timeoutMs,
    startedAt,
    maxTravelDistance: DEFAULT_MAX_TRAVEL_DISTANCE
  });

  return {
    solver: "local-geo",
    elapsedMs: Date.now() - startedAt,
    candidates: [candidate]
  };
}

type SimulationArgs = {
  cue: Ball;
  initialDirection: Vec2;
  balls: Ball[];
  timeoutMs: number;
  startedAt: number;
  maxTravelDistance: number;
};

function simulateTrajectory(args: SimulationArgs): CandidatePath {
  const segments: PathSegment[] = [];
  const cueRadius = args.cue.radius;
  let current = { ...args.cue.pos };
  let direction = { ...args.initialDirection };
  let cushions = 0;
  let travelDistance = 0;
  let minClearance = Number.POSITIVE_INFINITY;
  let rejectReason: RejectReason | undefined;

  if (args.timeoutMs <= 0) {
    return buildRejectedCandidate(args.cue, args.balls, "timeout");
  }

  for (let bounce = 0; bounce < MAX_BOUNCES; bounce += 1) {
    if (Date.now() - args.startedAt >= args.timeoutMs) {
      rejectReason = "timeout";
      break;
    }

    const hit = findNextHit(current, direction, cueRadius, args.balls);

    if (!hit) {
      const endPoint = advanceToTableEdge(current, direction, cueRadius);
      const nextDistance = segmentLength(segment(current, endPoint));

      if (travelDistance + nextDistance > args.maxTravelDistance + EPSILON) {
        const clampedPoint = clampPointAtDistance(current, direction, args.maxTravelDistance - travelDistance);

        appendSegment(segments, current, clampedPoint, segments.length === 0 ? "start" : "end");
        travelDistance = args.maxTravelDistance;
        rejectReason = "travel-distance-threshold";
      } else {
        appendSegment(segments, current, endPoint, segments.length === 0 ? "start" : "end");
        travelDistance += nextDistance;
      }

      break;
    }

    const nextDistance = segmentLength(segment(current, hit.point));

    if (travelDistance + nextDistance > args.maxTravelDistance + EPSILON) {
      const clampedPoint = clampPointAtDistance(current, direction, args.maxTravelDistance - travelDistance);

      appendSegment(segments, current, clampedPoint, segments.length === 0 ? "start" : "end");
      travelDistance = args.maxTravelDistance;
      rejectReason = "travel-distance-threshold";
      break;
    }

    appendSegment(segments, current, hit.point, segments.length === 0 ? "start" : hit.kind === "cushion" ? "cushion" : "contact");
    travelDistance += nextDistance;
    minClearance = Math.min(minClearance, computeMinClearance(segments[segments.length - 1], cueRadius, args.balls));

    if (hit.kind === "ball") {
      break;
    }

    cushions += 1;
    current = hit.point;
    direction = reflect(direction, hit.side);
  }

  if (!Number.isFinite(minClearance)) {
    minClearance = DEFAULT_MIN_CLEARANCE;
  }

  return {
    id: `mode2-${cushions}-${segments.length}`,
    score: rankScore(cushions, travelDistance, minClearance, rejectReason),
    cushions,
    blocked: false,
    rejectReason,
    segments,
    metrics: {
      travelDistance,
      minClearance,
      estError: 0
    }
  };
}

function buildRejectedCandidate(cue: Ball, balls: Ball[], reason: RejectReason): CandidatePath {
  const segmentStart = { ...cue.pos };
  const minClearance = computeMinClearance(
    {
      from: segmentStart,
      to: segmentStart,
      event: "start"
    },
    cue.radius,
    balls
  );

  return {
    id: `mode2-rejected-${reason}`,
    score: rankScore(0, 0, Number.isFinite(minClearance) ? minClearance : DEFAULT_MIN_CLEARANCE, reason),
    cushions: 0,
    blocked: false,
    rejectReason: reason,
    segments: [
      {
        from: segmentStart,
        to: segmentStart,
        event: "start"
      }
    ],
    metrics: {
      travelDistance: 0,
      minClearance: Number.isFinite(minClearance) ? minClearance : DEFAULT_MIN_CLEARANCE,
      estError: 0
    }
  };
}

function getCueDirection(req: SolveRequest): Vec2 {
  const cueDirection = req.input?.cueDirection;

  if (!cueDirection || !Number.isFinite(cueDirection.x) || !Number.isFinite(cueDirection.y)) {
    throw new Error("mode2 requires cueDirection");
  }

  return cueDirection;
}

function findNextHit(current: Vec2, direction: Vec2, cueRadius: number, balls: Ball[]): RayHit | null {
  let bestBall: RayHit | null = null;

  for (const ball of balls) {
    const hit = intersectRayCircle(current, direction, ball, cueRadius);

    if (!hit) {
      continue;
    }

    if (!bestBall || hit.t < bestBall.t - EPSILON) {
      bestBall = {
        kind: "ball",
        t: hit.t,
        point: hit.point
      };
    }
  }

  const cushionHit = intersectRayWithTable(current, direction, cueRadius);

  if (bestBall && (!cushionHit || bestBall.t <= cushionHit.t + EPSILON)) {
    return bestBall;
  }

  return cushionHit;
}

function intersectRayCircle(origin: Vec2, direction: Vec2, ball: Ball, cueRadius: number): { t: number; point: Vec2 } | null {
  const dx = origin.x - ball.pos.x;
  const dy = origin.y - ball.pos.y;
  const radius = cueRadius + ball.radius;
  const b = 2 * (dx * direction.x + dy * direction.y);
  const c = dx * dx + dy * dy - radius * radius;
  const discriminant = b * b - 4 * c;

  if (discriminant < 0) {
    return null;
  }

  const root = Math.sqrt(discriminant);
  const t1 = (-b - root) / 2;
  const t2 = (-b + root) / 2;
  const t = smallestPositiveT(t1, t2);

  if (t == null) {
    return null;
  }

  return {
    t,
    point: advancePoint(origin, direction, t)
  };
}

function intersectRayWithTable(origin: Vec2, direction: Vec2, cueRadius: number): RayHit | null {
  const minX = cueRadius;
  const maxX = 1 - cueRadius;
  const minY = cueRadius;
  const maxY = 1 - cueRadius;
  const candidates: RayHit[] = [];

  if (direction.x > EPSILON) {
    const t = (maxX - origin.x) / direction.x;
    if (t > EPSILON) {
      candidates.push({ kind: "cushion", t, point: { x: maxX, y: origin.y + direction.y * t }, side: "right" });
    }
  } else if (direction.x < -EPSILON) {
    const t = (minX - origin.x) / direction.x;
    if (t > EPSILON) {
      candidates.push({ kind: "cushion", t, point: { x: minX, y: origin.y + direction.y * t }, side: "left" });
    }
  }

  if (direction.y > EPSILON) {
    const t = (maxY - origin.y) / direction.y;
    if (t > EPSILON) {
      candidates.push({ kind: "cushion", t, point: { x: origin.x + direction.x * t, y: maxY }, side: "bottom" });
    }
  } else if (direction.y < -EPSILON) {
    const t = (minY - origin.y) / direction.y;
    if (t > EPSILON) {
      candidates.push({ kind: "cushion", t, point: { x: origin.x + direction.x * t, y: minY }, side: "top" });
    }
  }

  let best: RayHit | null = null;

  for (const candidate of candidates) {
    if (!isInsideTable(candidate.point, cueRadius)) {
      continue;
    }

    if (!best || candidate.t < best.t - EPSILON) {
      best = candidate;
    }
  }

  return best;
}

function advanceToTableEdge(origin: Vec2, direction: Vec2, cueRadius: number): Vec2 {
  const hit = intersectRayWithTable(origin, direction, cueRadius);

  return hit ? hit.point : { ...origin };
}

function clampPointAtDistance(origin: Vec2, direction: Vec2, distance: number): Vec2 {
  return advancePoint(origin, direction, Math.max(0, distance));
}

function appendSegment(segments: PathSegment[], from: Vec2, to: Vec2, event: PathSegment["event"]): void {
  segments.push({ from, to, event });
}

function computeMinClearance(currentSegment: PathSegment, cueRadius: number, balls: Ball[]): number {
  let minClearance = Number.POSITIVE_INFINITY;

  for (const ball of balls) {
    const clearance = distancePointToSegment(ball.pos, segment(currentSegment.from, currentSegment.to)) - (cueRadius + ball.radius);
    minClearance = Math.min(minClearance, clearance);
  }

  return minClearance;
}

function smallestPositiveT(t1: number, t2: number): number | null {
  let best = Number.POSITIVE_INFINITY;

  for (const t of [t1, t2]) {
    if (t > EPSILON && t < best) {
      best = t;
    }
  }

  return Number.isFinite(best) ? best : null;
}

function normalize(value: Vec2): Vec2 {
  const length = Math.hypot(value.x, value.y);

  if (length <= EPSILON) {
    throw new Error("cueDirection must not be zero");
  }

  return {
    x: value.x / length,
    y: value.y / length
  };
}

function isInsideTable(point: Vec2, cueRadius: number): boolean {
  return (
    point.x >= cueRadius - EPSILON &&
    point.x <= 1 - cueRadius + EPSILON &&
    point.y >= cueRadius - EPSILON &&
    point.y <= 1 - cueRadius + EPSILON
  );
}

function reflect(direction: Vec2, side: CushionSide): Vec2 {
  switch (side) {
    case "left":
    case "right":
      return { x: -direction.x, y: direction.y };
    case "top":
    case "bottom":
      return { x: direction.x, y: -direction.y };
  }
}

function rankScore(cushions: number, travelDistance: number, minClearance: number, rejectReason?: RejectReason): number {
  const base = rejectReason ? -1_000_000 : 1_000_000;

  return base - cushions * 1_000 - travelDistance * 100 + minClearance * 10;
}

function getBall(balls: Ball[], role: Ball["role"]): Ball {
  const ball = balls.find((candidate) => candidate.role === role);

  if (!ball) {
    throw new Error(`${role} ball is required`);
  }

  return ball;
}

function advancePoint(point: Vec2, direction: Vec2, t: number): Vec2 {
  return {
    x: point.x + direction.x * t,
    y: point.y + direction.y * t
  };
}
