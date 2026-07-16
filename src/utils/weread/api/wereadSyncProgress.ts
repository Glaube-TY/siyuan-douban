/**
 * 微信读书同步进度事件类型定义
 * 用于在同步过程中提供实时反馈
 */

export type WereadSyncStage =
  | "checking_sources"
  | "planning"
  | "confirming"
  | "preparing"
  | "writing"
  | "item_success"
  | "item_failed"
  | "item_skipped"
  | "finished"
  | "cancelled";

export interface WereadSyncProgressEvent {
  stage: WereadSyncStage;
  sourceType?: "book" | "mp";
  bookID?: string;
  title?: string;
  index?: number;
  total?: number;
  message: string;
  status?: "running" | "success" | "failed" | "skipped" | "cancelled";
  timestamp?: number;
}

export interface WereadSyncProgressViewState {
  percent: number;
  determinate: boolean;
  label: string;
  currentIndex: number;
  totalItems: number;
  stage: WereadSyncStage;
  sourceType?: "book" | "mp";
}

export function createWereadSyncProgressViewState(): WereadSyncProgressViewState {
  return {
    percent: 0,
    determinate: false,
    label: "等待开始",
    currentIndex: 0,
    totalItems: 0,
    stage: "checking_sources",
  };
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getProgressLabel(event: WereadSyncProgressEvent, index: number, total: number): string {
  const countText = total > 0 ? ` ${Math.min(index, total)}/${total}` : "";
  switch (event.stage) {
    case "checking_sources": return "正在检查来源";
    case "planning": return "正在生成同步计划";
    case "confirming": return "等待确认同步计划";
    case "preparing": return `正在准备${countText}`;
    case "writing": return `正在写入${countText}`;
    case "item_success": return `已完成${countText}`;
    case "item_failed": return `处理失败${countText}`;
    case "item_skipped": return `已跳过${countText}`;
    case "finished": return event.sourceType ? "当前来源已完成" : "同步完成";
    case "cancelled": return "同步已取消";
    default: return event.message;
  }
}

/**
 * 把分阶段、分来源的事件转换为单调递增的工作台进度。
 * 普通书占前半段，公众号占后半段；无法量化的检查与确认阶段显示阶段状态而非 0%。
 */
export function reduceWereadSyncProgressViewState(
  previous: WereadSyncProgressViewState,
  event: WereadSyncProgressEvent,
): WereadSyncProgressViewState {
  const sourceChanged = !!event.sourceType && event.sourceType !== previous.sourceType;
  const stageChanged = event.stage !== previous.stage || sourceChanged;
  const totalItems = event.total !== undefined
    ? Math.max(0, event.total)
    : sourceChanged
      ? 0
      : previous.totalItems;
  const currentIndex = event.index !== undefined
    ? Math.max(0, event.index)
    : sourceChanged || stageChanged && (event.stage === "preparing" || event.stage === "writing")
      ? 0
      : previous.currentIndex;
  const ratio = totalItems > 0 ? Math.min(1, currentIndex / totalItems) : 0;

  let candidate = previous.percent;
  let determinate = false;

  switch (event.stage) {
    case "checking_sources":
      candidate = 3;
      break;
    case "planning":
      candidate = event.sourceType === "mp" ? 62 : 8;
      break;
    case "confirming":
      candidate = event.sourceType === "mp" ? 68 : 12;
      break;
    case "preparing":
      determinate = totalItems > 0;
      candidate = event.sourceType === "mp"
        ? 68 + ratio * 7
        : 15 + ratio * 20;
      break;
    case "writing":
    case "item_success":
    case "item_failed":
      determinate = totalItems > 0;
      candidate = event.sourceType === "mp"
        ? 75 + ratio * 20
        : 35 + ratio * 25;
      break;
    case "item_skipped":
      // 跳过日志未必属于待同步计划，不用它推动条目进度。
      candidate = previous.percent;
      determinate = previous.determinate;
      break;
    case "finished":
      candidate = event.sourceType === "book" ? 60 : event.sourceType === "mp" ? 95 : 100;
      determinate = !event.sourceType;
      break;
    case "cancelled":
      candidate = previous.percent;
      break;
  }

  const percent = clampProgress(Math.max(previous.percent, candidate));
  return {
    percent,
    determinate,
    label: getProgressLabel(event, currentIndex, totalItems),
    currentIndex,
    totalItems,
    stage: event.stage,
    sourceType: event.sourceType || previous.sourceType,
  };
}

export interface WereadSyncPlanItem {
  sourceType: "book" | "mp";
  bookID: string;
  title: string;
  reason?: string;
}

export interface WereadSyncPlanConfirmPayload {
  mode: "all" | "update";
  sourceType: "book" | "mp";
  title: string;
  plannedItems: WereadSyncPlanItem[];
  skippedCount?: number;
}

export type WereadSyncProgressCallback = (event: WereadSyncProgressEvent) => void;
export type WereadSyncPlanConfirmCallback = (payload: WereadSyncPlanConfirmPayload) => Promise<boolean>;
