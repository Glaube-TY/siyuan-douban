import { findWereadApiBookTargetDoc } from "./findWereadApiBookTargetDoc";
import { getIgnoredBookIDSet, loadIgnoredBooks } from "../wereadSyncStorage";
import { t } from "../../i18n";

/** Reject different sources targeting one document, including force-sync retries. */
export function rejectSharedWereadSyncTargets<T extends { bookID: string; blockID?: string; status: string; matchType?: string; message: string }>(
  items: T[], plugin: any,
): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (item.status !== "ready" || !item.blockID) continue;
    if (!groups.has(item.blockID)) groups.set(item.blockID, []);
    groups.get(item.blockID)!.push(item);
  }
  return items.map(item => {
    const group = groups.get(item.blockID || "") || [];
    if (new Set(group.map(entry => entry.bookID)).size < 2) return item;
    const explicit = group.filter(entry => entry.matchType === "bookID");
    if (explicit.length === 1 && explicit[0].bookID === item.bookID) return item;
    return { ...item, status: "failed", blockID: undefined, message: t(plugin, "wereadIdentitySharedDoc", "不同 bookID 共用同一读书笔记文档，需使用 bookID 或 ISBN 重新确认独立目标。") };
  });
}

interface WereadPluginLike {
  loadData: (key: string) => Promise<any>;
  i18n: Record<string, string>;
}

export async function preflightWereadApiBooksSync(plugin: WereadPluginLike): Promise<{
  total: number;
  checked: number;
  ready: number;
  skippedMp: number;
  skippedIgnored: number;
  failed: number;
  items: Array<{
    bookID: string;
    title: string;
    sourceType: string;
    status: "ready" | "skipped_mp" | "skipped_ignored" | "failed";
    matchType?: "bookID" | "ISBN" | "title";
    blockID?: string;
    message: string;
  }>;
}> {
  const cache = await plugin.loadData("temporary_weread_notebooksList");

  if (!Array.isArray(cache) || cache.length === 0) {
    return {
      total: 0,
      checked: 0,
      ready: 0,
      skippedMp: 0,
      skippedIgnored: 0,
      failed: 1,
      items: [{
        bookID: "",
        title: "",
        sourceType: "",
        status: "failed",
        message: "请先拉取有笔记书籍缓存",
      }],
    };
  }

  const items: Array<{
    bookID: string;
    title: string;
    sourceType: string;
    status: "ready" | "skipped_mp" | "skipped_ignored" | "failed";
    matchType?: "bookID" | "ISBN" | "title";
    blockID?: string;
    message: string;
  }> = [];

  let ready = 0;
  let skippedMp = 0;
  let skippedIgnored = 0;
  let failed = 0;
  const ignoredBookIDs = getIgnoredBookIDSet(await loadIgnoredBooks(plugin));
  const ignoredMessage = plugin.i18n.syncSkippedIgnored || "已设置为停止同步，跳过检测";

  for (const book of cache) {
    const bookID = String(book?.bookID ?? book?.bookId ?? "").trim();
    const title = book?.title || "";
    const isbn = book?.isbn || "";
    const sourceType = book?.sourceType || "";

    if (!bookID) {
      continue;
    }

    if (sourceType === "weread_mp_account" || bookID.startsWith("MP_WXS_")) {
      skippedMp++;
      items.push({
        bookID,
        title,
        sourceType,
        status: "skipped_mp",
        message: "公众号书籍跳过",
      });
      continue;
    }

    if (ignoredBookIDs.has(String(bookID))) {
      skippedIgnored++;
      items.push({
        bookID,
        title,
        sourceType,
        status: "skipped_ignored",
        message: ignoredMessage,
      });
      continue;
    }

    const result = await findWereadApiBookTargetDoc(
      plugin,
      { bookID, title, isbn },
      { cleanupOrphans: false }
    );

    if (result.success) {
      ready++;
      items.push({
        bookID,
        title,
        sourceType,
        status: "ready",
        matchType: result.matchType,
        blockID: result.blockID,
        message: result.message,
      });
    } else {
      failed++;
      items.push({
        bookID,
        title,
        sourceType,
        status: "failed",
        message: `${result.message}（bookID=${bookID}, isbn=${isbn || "空"}）`,
      });
    }
  }

  const checkedItems = rejectSharedWereadSyncTargets(items, plugin);
  ready = checkedItems.filter(item => item.status === "ready").length;
  failed = checkedItems.filter(item => item.status === "failed").length;
  return {
    total: cache.length,
    checked: items.length,
    ready,
    skippedMp,
    skippedIgnored,
    failed,
    items: checkedItems,
  };
}
