# 微信小程序设计文档：中式八球解球线路（MVP）

日期：2026-03-25  
状态：已完成设计评审前版本

## 1. 目标与范围

本项目为微信小程序，提供中式八球台面上的两种计算能力：

1. 模式1：用户手动标注母球、目标球、障碍球，小程序计算多条可行线路，要求不碰障碍球。首版可行定义为“母球能合法碰到目标球”，不要求进袋。
2. 模式2：用户标注母球与击打方向，计算母球行进线路。

首版目标为可演示、可解释、可回放，算法精度采用分层演进：先本地几何可用，再升级后端高仿真。

## 2. 已确认需求

1. MVP 同时覆盖模式1和模式2。
2. 长期目标为高仿真级精度。
3. 技术路线采用“前端先可用 + 预留后端高仿真接口”。
4. 模式1需覆盖 2-5 库解球线路。
5. 模式1可行性判定为“能合法碰到目标球”。
6. 首版交互为“点按钮计算”，可接受 1-3 秒延迟。

## 3. 架构设计

采用四层架构，确保算法可替换、前端低耦合：

1. 小程序 UI 层  
   - 台面画布、球体标注、模式切换、参数设置（2-5 库）、结果列表、轨迹高亮与动画回放。
2. 前端 Solver Adapter 层  
   - 对外统一 `solveShot(request): SolveResponse`。  
   - 内部可切换 `local-geo-solver` 与 `remote-physics-solver`。
3. 求解层  
   - 本地几何求解器：MVP 主力实现。  
   - 后端高仿真求解器：后续升级实现。
4. 校准与回放层  
   - 统一轨迹结构与回放协议。  
   - 支持后续“本地结果 vs 高仿真结果”偏差统计与调参。

## 4. 核心数据模型与接口协议

```ts
type Vec2 = { x: number; y: number }; // 归一化台面坐标 [0,1]

type Ball = {
  id: string;
  role: "cue" | "target" | "obstacle";
  pos: Vec2;
  radius: number;
};

type Table = {
  width: number;
  height: number;
  pocketR: number;
};

type SolveMode = "mode1_contact_paths" | "mode2_cue_direction";

type SolveRequest = {
  mode: SolveMode;
  table: Table;
  balls: Ball[];
  constraints: {
    cushionMin?: number;
    cushionMax?: number;
    avoidObstacle: boolean;
    timeoutMs: number;
  };
  input: {
    cueDirection?: Vec2;
  };
};

type PathSegment = {
  from: Vec2;
  to: Vec2;
  event: "start" | "cushion" | "contact" | "end";
};

type CandidatePath = {
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

type SolveResponse = {
  solver: "local-geo" | "remote-physics";
  elapsedMs: number;
  candidates: CandidatePath[];
};
```

协议约束：

1. UI 只依赖 `SolveRequest/SolveResponse`。
2. 可行与不可行候选均可返回，不可行项需含 `rejectReason`，用于解释性展示。
3. 高仿真升级通过新增 `metrics` 字段扩展，避免破坏兼容。
4. 坐标系统一为左上角原点，x 向右、y 向下，所有球心坐标均归一化到 `[0,1]`。
5. `Table.width/height` 仅用于比例和物理换算基准，不与 `Vec2` 的归一化规则冲突。
6. `balls` 中 `cue` 必填；模式1下 `target` 必填，模式2下 `target` 可为空。

## 5. 算法设计

### 5.1 模式1：母球到目标球（2-5 库）

1. 候选生成  
   - 采用镜像台面法生成目标球镜像点序列，对应 2-5 次碰库组合。  
   - 母球到镜像目标做反推直线，恢复理论碰库点与接触点。
2. 合法性过滤  
   - 分段轨迹执行“球心通道”碰撞检测（通道半径=球半径），与障碍球冲突即阻挡。  
   - 碰库点必须落在有效库边，排除袋口区域。  
   - 接触点满足母球与目标球球心距近似 `2r`。
3. 排序输出  
   - 优先 `blocked=false`，再按库数少、路程短、最小净距大排序。  
   - 默认返回前 5-10 条候选。

### 5.2 模式2：母球 + 击打方向

1. 前向模拟  
   - 沿方向向量发射射线，求与库边交点并反射迭代。  
   - 每段检测是否先撞球（任一非母球），触发碰撞事件。
2. 终止条件  
   - 达到最大反射次数、最大总路程、首次碰球或超时即结束。
3. 输出  
   - 统一输出 `segments` 以复用同一回放组件。

## 6. 错误处理与可解释性

1. 输入错误：球重叠、越界、缺少必需球、零方向向量，直接返回可读错误。
2. 超时：返回 `rejectReason="timeout"` 和耗时，提示用户减少库数范围或障碍球数量。
3. 无解：返回空可行集与拒绝原因统计（如障碍阻挡、几何不可达）。
4. 可解释输出：每条候选携带库数、最小净距、总路程、阻挡原因。

## 7. 测试策略

1. 几何单元测试  
   - 反射点计算、镜像反推、线段-球通道碰撞。
2. 场景回归测试  
   - 固定 20-50 个台面样例，验证“是否有解”和前几名稳定性。
3. 协议回归测试  
   - `SolveRequest/SolveResponse` schema 校验，保障前后端可替换。
4. 性能基线测试  
   - 覆盖 2-5 库搜索典型场景，监控计算时间与退化风险。

## 8. 输入约束与默认值（MVP）

1. 模式1默认 `cushionMin=2`、`cushionMax=5`，并要求 `cushionMin <= cushionMax`。
2. 模式1默认返回前 10 条候选；若不足则返回全部可行候选。
3. 模式2中 `constraints.cushionMin/cushionMax` 忽略不用，仅使用方向向量与终止阈值。
4. 所有模式均要求球之间初始不重叠，且球心到边界距离不小于半径。

## 9. MVP 交付清单

1. 支持模式1与模式2完整交互。
2. 模式1支持 2-5 库搜索，避开障碍球，目标为合法碰到目标球。
3. 模式2支持给定方向后的轨迹计算与回放。
4. 交互模式为按钮触发计算。
5. 先实现本地几何求解器，并提供后端高仿真接口占位。

## 10. 后续演进（非 MVP）

1. 接入远程高仿真求解器（旋转、摩擦、能量损失）。
2. 增加“进袋约束”模式与袋口选择。
3. 提供本地/远端结果偏差可视化与自动校准。
4. 支持实时拖动预览与异步高精度刷新。
