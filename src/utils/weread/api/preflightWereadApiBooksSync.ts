import { findWereadApiBookTargetDoc } from "./findWereadApiBookTargetDoc";
import { getIgnoredBookIDSet, loadIgnoredBooks } from "../wereadSyncStorage";

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

  return {
    total: cache.length,
    checked: items.length,
    ready,
    skippedMp,
    skippedIgnored,
    failed,
    items,
  };
}
