import { channelHitsBall } from "../collision";
import { distancePointToSegment, segment, segmentLength } from "../geometry";
import type { Ball, CandidatePath, PathSegment, SolveRequest, SolveResponse, Vec2 } from "../types";

type CushionSide = "left" | "right" | "top" | "bottom";

const CUSHION_SIDES: CushionSide[] = ["left", "right", "top", "bottom"];
const EPSILON = 1e-9;
const DEFAULT_MIN_CLEARANCE = 1;

export function solveMode1(req: SolveRequest): SolveResponse {
  if (req.mode !== "mode1_contact_paths") {
    throw new Error("solveMode1 requires mode1_contact_paths request");
  }

  const startedAt = Date.now();
  const cue = getBall(req.balls, "cue");
  const target = getBall(req.balls, "target");
  const obstacles = req.balls.filter((ball) => ball.role === "obstacle");
  const cushionMin = req.constraints.cushionMin ?? 2;
  const cushionMax = req.constraints.cushionMax ?? 5;
  const candidates: CandidatePath[] = [];

  for (const sequence of generateCushionSequences(cushionMin, cushionMax)) {
    const candidate = buildCandidateFromMirror(sequence, cue, target, obstacles, req.constraints.avoidObstacle !== false);

    if (candidate) {
      candidates.push(candidate);
    }
  }

  const filtered = filterBlockedCandidates(candidates).sort(compareCandidates);

  return {
    solver: "local-geo",
    elapsedMs: Date.now() - startedAt,
    candidates: filtered
  };
}

function buildCandidateFromMirror(
  sequence: CushionSide[],
  cue: Ball,
  target: Ball,
  obstacles: Ball[],
  avoidObstacle: boolean
): CandidatePath | null {
  const travelPoints = buildTravelPoints(cue.pos, target.pos, sequence, cue.radius);

  if (!travelPoints) {
    return null;
  }

  const contactPoint = buildContactPoint(travelPoints[travelPoints.length - 1], cue.radius, target);

  if (!contactPoint) {
    return null;
  }

  const points = [...travelPoints, contactPoint];
  const segments = buildSegments(points);
  const travelDistance = segments.reduce((total, current) => total + segmentLength(segment(current.from, current.to)), 0);
  const minClearance = computeMinClearance(segments, cue.radius, obstacles);
  const blocked = avoidObstacle && obstacles.some((obstacle) => intersectsObstacle(segments, cue.radius, obstacle));

  return {
    id: `mode1-${sequence.length}-${sequence.map((side) => side[0].toUpperCase()).join("")}`,
    score: rankScore(sequence.length, travelDistance, minClearance, blocked),
    cushions: sequence.length,
    blocked,
    rejectReason: blocked ? "blocked by obstacle" : undefined,
    segments,
    metrics: {
      travelDistance,
      minClearance,
      estError: 0
    }
  };
}

function buildTravelPoints(cue: Vec2, target: Vec2, sequence: CushionSide[], cueRadius: number): Vec2[] | null {
  const mirroredTarget = sequence.reduceRight((point, side) => reflectPoint(point, side, cueRadius), target);
  const points: Vec2[] = [cue];
  let current = cue;
  let aim = mirroredTarget;

  for (const side of sequence) {
    const bounce = intersectCushion(current, aim, side, cueRadius);

    if (!bounce) {
      return null;
    }

    points.push(bounce);
    current = bounce;
    aim = reflectPoint(aim, side, cueRadius);
  }

  return points;
}

function buildContactPoint(from: Vec2, cueRadius: number, target: Ball): Vec2 | null {
  const dx = target.pos.x - from.x;
  const dy = target.pos.y - from.y;
  const distance = Math.hypot(dx, dy);
  const contactDistance = cueRadius + target.radius;

  if (distance <= contactDistance + EPSILON) {
    return null;
  }

  const scale = (distance - contactDistance) / distance;

  return {
    x: from.x + dx * scale,
    y: from.y + dy * scale
  };
}

function buildSegments(points: Vec2[]): PathSegment[] {
  return points.slice(0, -1).map((from, index) => ({
    from,
    to: points[index + 1],
    event: index === 0 ? "start" : index === points.length - 2 ? "contact" : "cushion"
  }));
}

function computeMinClearance(segments: PathSegment[], cueRadius: number, obstacles: Ball[]): number {
  if (obstacles.length === 0) {
    return DEFAULT_MIN_CLEARANCE;
  }

  let minClearance = Number.POSITIVE_INFINITY;

  for (const obstacle of obstacles) {
    for (const current of segments) {
      const clearance =
        distancePointToSegment(obstacle.pos, segment(current.from, current.to)) - (cueRadius + obstacle.radius);

      minClearance = Math.min(minClearance, clearance);
    }
  }

  return Number.isFinite(minClearance) ? minClearance : DEFAULT_MIN_CLEARANCE;
}

function intersectsObstacle(segments: PathSegment[], cueRadius: number, obstacle: Ball): boolean {
  return segments.some((current) =>
    channelHitsBall(segment(current.from, current.to), obstacle.pos, cueRadius + obstacle.radius)
  );
}

function generateCushionSequences(min: number, max: number): CushionSide[][] {
  const sequences: CushionSide[][] = [];

  for (let count = min; count <= max; count++) {
    expandSequences(count, [], sequences);
  }

  return sequences;
}

function expandSequences(targetLength: number, prefix: CushionSide[], sequences: CushionSide[][]): void {
  if (prefix.length === targetLength) {
    sequences.push([...prefix]);
    return;
  }

  for (const side of CUSHION_SIDES) {
    if (prefix[prefix.length - 1] === side) {
      continue;
    }

    prefix.push(side);
    expandSequences(targetLength, prefix, sequences);
    prefix.pop();
  }
}

function compareCandidates(a: CandidatePath, b: CandidatePath): number {
  if (a.blocked !== b.blocked) {
    return a.blocked ? 1 : -1;
  }

  if (a.cushions !== b.cushions) {
    return a.cushions - b.cushions;
  }

  if (Math.abs(a.metrics.travelDistance - b.metrics.travelDistance) > EPSILON) {
    return a.metrics.travelDistance - b.metrics.travelDistance;
  }

  if (Math.abs(a.metrics.minClearance - b.metrics.minClearance) > EPSILON) {
    return b.metrics.minClearance - a.metrics.minClearance;
  }

  return a.id.localeCompare(b.id);
}

function filterBlockedCandidates(candidates: CandidatePath[]): CandidatePath[] {
  const openCandidates = candidates.filter((candidate) => !candidate.blocked);

  return openCandidates.length > 0 ? openCandidates : candidates;
}

function rankScore(cushions: number, travelDistance: number, minClearance: number, blocked: boolean): number {
  const base = blocked ? -1_000_000 : 1_000_000;

  return base - cushions * 1_000 - travelDistance * 100 + minClearance * 10;
}

function intersectCushion(from: Vec2, to: Vec2, side: CushionSide, cueRadius: number): Vec2 | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const minBound = cueRadius;
  const maxBound = 1 - cueRadius;

  if (side === "left" || side === "right") {
    const x = side === "left" ? minBound : maxBound;

    if (Math.abs(dx) <= EPSILON) {
      return null;
    }

    const t = (x - from.x) / dx;

    if (t <= EPSILON || t >= 1 - EPSILON) {
      return null;
    }

    const y = from.y + dy * t;

    return y <= minBound + EPSILON || y >= maxBound - EPSILON ? null : { x, y };
  }

  const y = side === "top" ? minBound : maxBound;

  if (Math.abs(dy) <= EPSILON) {
    return null;
  }

  const t = (y - from.y) / dy;

  if (t <= EPSILON || t >= 1 - EPSILON) {
    return null;
  }

  const x = from.x + dx * t;

  return x <= minBound + EPSILON || x >= maxBound - EPSILON ? null : { x, y };
}

function reflectPoint(point: Vec2, side: CushionSide, cueRadius: number): Vec2 {
  switch (side) {
    case "left":
      return { x: 2 * cueRadius - point.x, y: point.y };
    case "right":
      return { x: 2 * (1 - cueRadius) - point.x, y: point.y };
    case "top":
      return { x: point.x, y: 2 * cueRadius - point.y };
    case "bottom":
      return { x: point.x, y: 2 * (1 - cueRadius) - point.y };
  }
}

function getBall(balls: Ball[], role: Ball["role"]): Ball {
  const ball = balls.find((candidate) => candidate.role === role);

  if (!ball) {
    throw new Error(`${role} ball is required`);
  }

  return ball;
}
