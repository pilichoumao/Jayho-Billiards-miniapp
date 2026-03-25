export type SolveMode = "mode1_contact_paths" | "mode2_cue_direction";

export type Vec2 = {
  x: number;
  y: number;
};

export type BallKind = "cue" | "target";

export type Ball = Vec2 & {
  id: string;
  kind: BallKind;
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
