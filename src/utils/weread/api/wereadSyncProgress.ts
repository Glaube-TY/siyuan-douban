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
