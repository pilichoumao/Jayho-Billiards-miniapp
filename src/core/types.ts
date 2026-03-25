export type SolveMode = "mode1_contact_paths" | "mode2_cue_direction";

export type Vec2 = {
  x: number;
  y: number;
};

export type BallRole = "cue" | "target" | "obstacle";

export type Ball = {
  id: string;
  role: BallRole;
  pos: Vec2;
  radius: number;
};

export type Table = {
  width: number;
  height: number;
  pocketR: number;
};

export type SolveConstraints = {
  cushionMin?: number;
  cushionMax?: number;
  avoidObstacle?: boolean;
  timeoutMs?: number;
};

export type SolveInput = {
  cueDirection?: Vec2;
};

export type SolveRequest = {
  mode: SolveMode;
  table: Table;
  balls: Ball[];
  constraints: SolveConstraints;
  input: SolveInput;
};

export type PathSegment = {
  from: Vec2;
  to: Vec2;
  event: "start" | "cushion" | "contact" | "end";
};

export type CandidatePath = {
  id: string;
  score: number;
  cushions: number;
  blocked: boolean;
  rejectReason?: string;
  segments: PathSegment[];
  metrics: {
    travelDistance: number;
    minClearance: number;
    estError?: number;
  };
};

export type SolveResponse = {
  solver: "local-geo" | "remote-physics";
  elapsedMs: number;
  candidates: CandidatePath[];
};
