import { t } from "../../i18n";

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

export function restrictWereadSyncPlan(
  planned: Array<{ bookID: string }>,
  ready: Map<string, { blockID?: string }>,
  sourceType: "book" | "mp",
  approved?: WereadApprovedSyncPlan,
  plugin?: any,
): void {
  if (!approved) return;
  const allowed = new Map(approved.items.filter(item => item.sourceType === sourceType && item.action !== "ignore").map(item => [item.bookID, item]));
  for (let index = planned.length - 1; index >= 0; index--) {
    const item = planned[index], permission = allowed.get(item.bookID);
    if (!permission) { planned.splice(index, 1); continue; }
    if (!permission.blockID || ready.get(item.bookID)?.blockID !== permission.blockID) {
      throw new Error(t(plugin, "wereadIdentityTargetChanged", "同步目标在预检后发生变化，已停止写入；请重新确认本地书籍绑定。"));
    }
  }
}
