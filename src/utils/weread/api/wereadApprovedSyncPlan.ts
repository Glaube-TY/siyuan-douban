import { t } from "../../i18n";
import type { WereadSyncPlanConfirmPayload } from "./wereadSyncProgress";

export type WereadSyncAction = "import_isbn" | "import_bookID" | "import_mp" | "update" | "ignore";

export interface WereadApprovedSyncItem {
  sourceType: "book" | "mp";
  bookID: string;
  action: WereadSyncAction;
  blockID?: string;
}

/** Owned by one confirmed task; execution cannot widen this list on a rescan. */
export interface WereadApprovedSyncPlan {
  readonly items: readonly WereadApprovedSyncItem[];
}

export function wereadSourceKey(item: { sourceType?: string; bookID: string }): string {
  return `${item.sourceType === "mp" || item.sourceType === "weread_mp_account" || item.bookID.startsWith("MP_WXS_") ? "mp" : "book"}:${item.bookID}`;
}

/** Display-only counts from the planners; never changes approval or execution. */
export function buildWereadSyncPlanSkipBreakdown(
  normalItems: ReadonlyArray<{ bookID: string; status: string }>,
  mpItems: ReadonlyArray<{ bookID: string; status: string }>,
  newSources: ReadonlyArray<{ sourceType?: string; bookID: string }>,
  plannedItems: ReadonlyArray<{ sourceType: "book" | "mp"; bookID: string }>,
): NonNullable<WereadSyncPlanConfirmPayload["skipBreakdown"]> {
  const excluded = new Set([...newSources.map(wereadSourceKey), ...plannedItems.map(item => `${item.sourceType}:${item.bookID}`)]);
  const statuses = new Map<string, Set<string>>();
  for (const [sourceType, items] of [["book", normalItems], ["mp", mpItems]] as const) {
    for (const item of items) {
      if (!item.bookID || item.status === "skipped_mp" || item.status === "skipped_normal_book") continue;
      const key = `${sourceType}:${item.bookID}`;
      if (excluded.has(key)) continue;
      if (!statuses.has(key)) statuses.set(key, new Set());
      statuses.get(key)!.add(item.status);
    }
  }
  const counts = { unchanged: 0, notReady: 0, ignored: 0 };
  for (const values of statuses.values()) {
    // Conflicting or unknown planner states do not establish a display category.
    if (values.size !== 1) continue;
    const [status] = values;
    if (status === "skipped_unchanged") counts.unchanged++;
    if (status === "skipped_not_ready") counts.notReady++;
    if (status === "skipped_ignored") counts.ignored++;
  }
  return counts;
}

export function restrictWereadSyncPlan(
  planned: Array<{ bookID: string }>,
  ready: Map<string, { blockID?: string }>,
  sourceType: "book" | "mp",
  results: Array<{ bookID: string; title: string; status: string; message: string; blockID?: string }>,
  approved?: WereadApprovedSyncPlan,
  plugin?: any,
) {
  const unavailable: typeof results = [];
  if (!approved) return unavailable;
  const allowed = new Map(approved.items.filter(item => item.sourceType === sourceType && item.action !== "ignore").map(item => [item.bookID, item]));
  for (let index = planned.length - 1; index >= 0; index--) {
    if (!allowed.has(planned[index].bookID)) planned.splice(index, 1);
  }
  // Rescanning can lose an approved source entirely, so reconcile from the approval.
  for (const permission of allowed.values()) {
    const previous = results.find(item => item.bookID === permission.bookID);
    const targetMatches = !!permission.blockID && ready.get(permission.bookID)?.blockID === permission.blockID;
    if (targetMatches && (planned.some(item => item.bookID === permission.bookID) || previous?.status === "skipped_unchanged")) continue;
    const reason = targetMatches ? "APPROVED_SOURCE_NOT_PLANNED" : ready.has(permission.bookID) ? "APPROVED_TARGET_CHANGED" : "APPROVED_SOURCE_NOT_READY";
    const failure = { bookID: permission.bookID, title: previous?.title || permission.bookID, blockID: permission.blockID, status: "failed",
      message: `${t(plugin, "wereadIdentityTargetChanged", "同步目标在预检后发生变化，已停止写入；请重新确认本地书籍绑定。")} [plan.execution/${reason}]${previous?.message ? ` ${previous.message}` : ""}` };
    for (let index = planned.length - 1; index >= 0; index--) if (planned[index].bookID === permission.bookID) planned.splice(index, 1);
    if (previous) Object.assign(previous, failure); else results.push(failure);
    unavailable.push(failure);
  }
  return unavailable;
}
