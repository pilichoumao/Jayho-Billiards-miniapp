import { solveShot } from "../../core/adapter";
import type { CandidatePath, SolveMode, SolveRequest, SolveResponse } from "../../core/types";

type IndexPageData = {
  mode: SolveMode;
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
    timeoutMs: 2000,
    cushionMin: 2,
    cushionMax: 5
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
    resultTitle: "",
    resultLines: [],
    errorText: ""
  },

  handleModeChange(event: ChangeEvent) {
    const page = this as PageInstance;
    const nextMode = event.detail?.value === "mode2_cue_direction" ? "mode2_cue_direction" : "mode1_contact_paths";

    page.setData({
      mode: nextMode,
      resultTitle: "",
      resultLines: [],
      errorText: ""
    });
  },

  handleCalculate() {
    const page = this as PageInstance;

    try {
      const result = solveShot(createRequest(page.data.mode));

      if (!hasUsableCandidate(result)) {
        page.setData({
          resultTitle: "",
          resultLines: [],
          errorText: NO_SOLUTION_TEXT
        });

        return;
      }

      const summary = summarizeResult(page.data.mode, result);

      page.setData({
        resultTitle: summary.title,
        resultLines: summary.lines,
        errorText: ""
      });
    } catch (error) {
      page.setData({
        resultTitle: "",
        resultLines: [],
        errorText: error instanceof Error ? error.message : "Calculation failed"
      });
    }
  }
});

function createRequest(mode: SolveMode): SolveRequest {
  const source = mode === "mode1_contact_paths" ? MODE1_REQUEST : MODE2_REQUEST;

  return {
    ...source,
    table: { ...source.table },
    constraints: { ...source.constraints },
    input: source.input.cueDirection ? { cueDirection: { ...source.input.cueDirection } } : {},
    balls: source.balls.map((ball) => ({
      ...ball,
      pos: { ...ball.pos }
    }))
  };
}

function hasUsableCandidate(result: SolveResponse): boolean {
  return result.candidates.some((candidate) => !candidate.blocked && !candidate.rejectReason);
}

function summarizeResult(mode: SolveMode, result: SolveResponse): { title: string; lines: string[] } {
  const lines = [`Candidates: ${result.candidates.length}`, `Solver: ${result.solver}`, `Elapsed: ${result.elapsedMs} ms`];
  const firstCandidate = result.candidates[0];

  if (firstCandidate) {
    lines.push(...summarizeCandidate(firstCandidate));
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
