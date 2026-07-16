import { showMessage } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import { sql, reloadAttributeView } from "@/api";
import { fetchBookHtml } from "@/utils/douban/book/getWebPage";
import { fetchDoubanBook } from "@/utils/douban/book/fetchBook";
import { loadAVData } from "@/utils/bookHandling/index";
import { addUseBookIDsToDatabase } from "@/utils/weread/addUseBookIDs";
import { ensureMpAccountInDatabase, type MpAccountRecord } from "@/utils/weread/addWereadMpAccounts";
import { saveIgnoredBooks, saveCustomBooksISBN, saveUseBookIDBooks } from "@/utils/weread/wereadSyncStorage";
import { buildWereadApiDatabaseBookDetail } from "./buildWereadApiDatabaseBookDetail";
import { buildWereadApiMpAccountSyncData } from "./buildWereadApiMpAccountSyncData";
import { detectWereadApiNewSources, type WereadApiNewSourceItem } from "./detectWereadApiNewSources";
import { findWereadApiBookTargetDoc } from "./findWereadApiBookTargetDoc";
import WereadNewBooks from "@/components/common/wereadNewBooksDialog.svelte";
import type { WereadSyncProgressCallback } from "./wereadSyncProgress";
import { t } from "@/utils/i18n";

interface WereadPluginLike {
  loadData: (key: string) => Promise<any>;
  saveData: (key: string, value: any) => Promise<void>;
  i18n: Record<string, string>;
}

export async function showWereadApiNewSourcesDialogAndSync(
  plugin: WereadPluginLike,
  apiKey: string,
  _mode: "all" | "update",
  runSync: (forceOptions?: { forceBookIDs?: string[]; forceMpBookIDs?: string[] }) => Promise<void>,
  onProgress?: WereadSyncProgressCallback,
): Promise<"synced" | "cancelled" | "no_work"> {
  try {
    const settings = await plugin.loadData("weread_settings") || {};
    const skipNewBookCheck = settings.skipNewBookCheck === true;

    if (skipNewBookCheck) {
      await runSync();
      return "synced";
    }

    let newSources: WereadApiNewSourceItem[];
    try {
      onProgress?.({
        stage: "planning",
        message: t(plugin, "newSourcesChecking", "正在比对本地数据库并检查新书籍和公众号..."),
        status: "running",
      });
      const result = await detectWereadApiNewSources(plugin, apiKey);
      newSources = result.newSources;
    } catch (e) {
      showMessage(plugin.i18n?.wereadApiCheckNewSourcesFailed || "检查新来源失败");
      throw e;
    }

    if (newSources.length === 0) {
      onProgress?.({
        stage: "planning",
        message: t(plugin, "newSourcesNoPending", "没有待处理的新来源，正在生成同步计划..."),
        status: "running",
      });
      await runSync();
      return "synced";
    }

    onProgress?.({
      stage: "confirming",
      total: newSources.length,
      message: t(plugin, "newSourcesFound", "发现 {count} 个新来源，等待确认处理方式...", { count: newSources.length }),
      status: "running",
    });

    return new Promise<"synced" | "cancelled">((resolve) => {
    const isMobileViewport = typeof window !== "undefined"
      && window.matchMedia?.("(max-width: 600px)").matches;
    const desktopDialogWidth = typeof window !== "undefined"
      ? `${Math.min(920, Math.max(560, window.innerWidth - 48))}px`
      : "920px";
    const dialog = svelteDialog({
      title: plugin.i18n.newBooksConfirm || "确认新来源",
      width: isMobileViewport ? "100vw" : desktopDialogWidth,
      height: isMobileViewport ? "100dvh" : undefined,
      disableClose: true,
      hideCloseIcon: true,
      constructor: (containerEl: HTMLElement) => {
        const booksForDialog = newSources.map(book => ({ ...book }));

        return new WereadNewBooks({
          target: containerEl,
          props: {
            i18n: plugin.i18n,
            books: booksForDialog,
            onConfirm: async (
              selectedBooks: WereadApiNewSourceItem[],
              ignoredBooks: WereadApiNewSourceItem[],
              useBookIDs: WereadApiNewSourceItem[]
            ) => {
              try {
                if (selectedBooks.length === 0 && (!useBookIDs || useBookIDs.length === 0)) {
                  dialog.close();
                  resolve("cancelled");
                  return;
                }

                onProgress?.({
                  stage: "confirming",
                  total: newSources.length,
                  message: t(plugin, "newSourcesConfirmed", "已确认新来源，正在导入所选来源并准备同步..."),
                  status: "running",
                });

                await handleNewSourcesConfirm(
                  plugin,
                  apiKey,
                  selectedBooks,
                  ignoredBooks,
                  useBookIDs,
                  newSources
                );

                const selectedNormalBooks = selectedBooks.filter(b => b.sourceType !== "weread_mp_account");
                const selectedMpAccounts = selectedBooks.filter(b => b.sourceType === "weread_mp_account");

                const forceBookIDs = [
                  ...selectedNormalBooks.map(b => b.bookID),
                  ...(useBookIDs || []).map(b => b.bookID),
                ].filter(Boolean);

                const forceMpBookIDs = selectedMpAccounts
                  .map(b => b.bookID)
                  .filter(Boolean);

                const selectedCount = selectedBooks?.length || 0;
                const bookIDCount = useBookIDs?.length || 0;
                const ignoredCount = ignoredBooks?.length || 0;

                showMessage(
                  plugin.i18n?.wereadApiNewSourceImportThenSyncDetailed
                    ?.replace("{selected}", String(selectedCount))
                    ?.replace("{bookID}", String(bookIDCount))
                    ?.replace("{ignored}", String(ignoredCount))
                  || `已处理新来源：导入 ${selectedCount} 个，使用 BookID ${bookIDCount} 个，忽略 ${ignoredCount} 个，正在同步笔记内容...`,
                  5000
                );
                dialog.close();

                try {
                  await runSync({ forceBookIDs, forceMpBookIDs });
                  resolve("synced");
                } catch (e) {
                  showMessage(t(plugin, "wereadSyncFailedWithError", "同步失败：{error}", { error: e?.message || t(plugin, "uiUnknownError", "未知错误") }));
                  resolve("cancelled");
                }
              } catch (e) {
                showMessage(t(plugin, "newSourcesProcessFailed", "处理新来源失败：{error}", { error: e?.message || t(plugin, "uiUnknownError", "未知错误") }));
                try { dialog.close(); } catch {}
                resolve("cancelled");
              }
            },
            onContinue: async (ignoredBooks: WereadApiNewSourceItem[]) => {
              try {
                onProgress?.({
                  stage: "planning",
                  message: t(plugin, "newSourcesSkippedPlanning", "已跳过新来源导入，正在生成已有来源同步计划..."),
                  status: "running",
                });
                showMessage(
                  plugin.i18n?.wereadApiContinueSyncingDetailed
                    || "已跳过新来源导入，正在同步已有书籍...",
                  5000
                );

                try {
                  await saveIgnoredBooks(plugin, ignoredBooks || []);
                } catch (e) {
                  console.warn("保存忽略书籍失败，但继续同步", e);
                }

                dialog.close();

                try {
                  await runSync();
                  resolve("synced");
                } catch (e) {
                  showMessage(t(plugin, "newSourcesContinueFailed", "继续同步失败：{error}", { error: e?.message || t(plugin, "uiUnknownError", "未知错误") }));
                  resolve("cancelled");
                }
              } catch (e) {
                showMessage(t(plugin, "newSourcesContinueFailed", "继续同步失败：{error}", { error: e?.message || t(plugin, "uiUnknownError", "未知错误") }));
                try { dialog.close(); } catch {}
                resolve("cancelled");
              }
            },
            onCancel: () => {
              dialog.close();
              resolve("cancelled");
            },
          },
        });
      },
    });
    if (isMobileViewport) {
      dialog.dialog.element.classList.add("siyuan-douban-mobile-subdialog");
    }
  });
  } catch (e) {
    showMessage(t(plugin, "wereadSyncFailedWithError", "同步失败：{error}", { error: e?.message || t(plugin, "uiUnknownError", "未知错误") }));
    throw e;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForImportedSourcesReady(
  plugin: WereadPluginLike,
  sources: WereadApiNewSourceItem[],
  avID?: string
): Promise<void> {
  const normalSources = sources.filter(s => s.sourceType !== "weread_mp_account");
  const mpSources = sources.filter(s => s.sourceType === "weread_mp_account");

  const targets = [...normalSources, ...mpSources].filter(s => s.bookID);

  if (targets.length === 0) return;

  for (let attempt = 0; attempt < 8; attempt++) {
    if (avID) {
      try { await reloadAttributeView(avID); } catch {}
    }

    let readyCount = 0;

    for (const source of targets) {
      try {
        const result = await findWereadApiBookTargetDoc(plugin, {
          bookID: source.bookID,
          title: source.title,
          isbn: source.sourceType === "weread_mp_account" ? "" : source.isbn
        }, { cleanupOrphans: false });

        if (result.success && result.blockID) {
          readyCount++;
        }
      } catch {}
    }

    if (readyCount === targets.length) return;

    await sleep(500);
  }

  // 不 throw。等待失败只表示后续 runSync 可能跳过，不能让弹窗卡死。
}

async function mergeNewSourceDetailsIntoNotebookCache(
  plugin: WereadPluginLike,
  sources: WereadApiNewSourceItem[]
): Promise<void> {
  const cache = await plugin.loadData("temporary_weread_notebooksList");
  if (!Array.isArray(cache) || !sources?.length) return;

  const sourceMap = new Map<string, WereadApiNewSourceItem>();
  for (const source of sources) {
    const id = source.bookID;
    if (id) sourceMap.set(id, source);
  }

  const updatedCache = cache.map((item: any) => {
    const bookID = item.bookID || item.bookId;
    const source = sourceMap.get(bookID);
    if (!source) return item;

    const rawIsbn = source.isbn || item.isbn;
    const normalizedIsbn = rawIsbn
      ? String(rawIsbn)
          .replace(/[\s\-\u2014\u2013_]/g, "")
          .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
          .trim()
      : item.isbn;

    return {
      ...item,
      isbn: normalizedIsbn || item.isbn,
      title: source.title || item.title,
      author: source.author || item.author,
      cover: source.cover || item.cover,
      introduction: source.introduction || item.introduction,
      publisher: source.publisher || item.publisher,
      publishTime: source.publishTime || item.publishTime,
      category: source.category || item.category,
      sourceType: source.sourceType || item.sourceType,
    };
  });

  await plugin.saveData("temporary_weread_notebooksList", updatedCache);
}

async function handleNewSourcesConfirm(
  plugin: WereadPluginLike,
  apiKey: string,
  selectedBooks: WereadApiNewSourceItem[],
  ignoredBooks: WereadApiNewSourceItem[],
  useBookIDs: WereadApiNewSourceItem[],
  allNewSources: WereadApiNewSourceItem[]
): Promise<void> {
  const selectedNormalBooks = selectedBooks.filter(b => b.sourceType !== "weread_mp_account");
  const selectedMpAccounts = selectedBooks.filter(b => b.sourceType === "weread_mp_account");
  const ignoredNormalBooks = ignoredBooks.filter(b => b.sourceType !== "weread_mp_account");
  const ignoredMpAccounts = ignoredBooks.filter(b => b.sourceType === "weread_mp_account");

  await saveCustomBooksISBN(plugin, selectedNormalBooks, allNewSources);
  await saveIgnoredBooks(plugin, [...ignoredNormalBooks, ...ignoredMpAccounts]);

  const settings = await plugin.loadData("settings.json") || {};
  const databaseBlockId = settings?.bookDatabaseID || "";
  let avID = "";
  if (databaseBlockId) {
    const blockResult = await sql(`SELECT * FROM blocks WHERE id = "${databaseBlockId}"`);
    avID = blockResult[0]?.markdown?.match(/data-av-id="([^"]+)"/)?.[1] || "";
  }

  if (useBookIDs && useBookIDs.length > 0) {
    await saveUseBookIDBooks(plugin, useBookIDs);

    for (const bookItem of useBookIDs) {
      try {
        const bookDetail = await buildWereadApiDatabaseBookDetail(apiKey, bookItem.bookID);
        if (avID) {
          const result = await addUseBookIDsToDatabase(plugin, avID, bookDetail);
          if (result?.code !== 0) {
            showMessage(t(plugin, "newSourcesBookIdImportFailed", "bookID 导入失败：{title}：{error}", { title: bookItem.title || bookItem.bookID, error: result?.msg || "" }));
          }
        }
      } catch (e) {
        showMessage(t(plugin, "newSourcesBookIdImportFailed", "bookID 导入失败：{title}：{error}", { title: bookItem.title || bookItem.bookID, error: e?.message || t(plugin, "uiUnknownError", "未知错误") }));
      }
    }
  }

  const settingConfig = await plugin.loadData("settings.json") || {};
  const noteTemplate = settingConfig?.noteTemplate || "";

  for (const book of selectedNormalBooks) {
    const isbn = book.isbn?.replace(/[-\s]/g, "");
    if (!isbn || (isbn.length !== 13 && isbn.length !== 10)) continue;

    try {
      const html = await fetchBookHtml(isbn);
      const doubanBook = await fetchDoubanBook(html);
      if (avID) {
        const result = await loadAVData(avID, {
          ...doubanBook,
          ISBN: isbn,
          addNotes: true,
          databaseBlockId,
          noteTemplate,
          myRating: "",
          bookCategory: "",
          readingStatus: "",
          startDate: "",
          finishDate: ""
        }, plugin);
        if (result?.code !== 0) {
          showMessage(t(plugin, "newSourcesBookImportFailed", "普通书导入失败：{title}：{error}", { title: book.title || book.bookID, error: result?.msg || "" }));
        } else {
          showMessage(t(plugin, "newSourcesBookImported", "成功导入《{title}》", { title: book.title || doubanBook.title || isbn }));
        }
      }
    } catch {
      showMessage(t(plugin, "newSourcesBookImportFailedShort", "普通书导入失败：{title}", { title: book.title || book.bookID }));
    }
  }

  for (const mp of selectedMpAccounts) {
    try {
      const syncData = await buildWereadApiMpAccountSyncData(apiKey, mp.bookID);
      const record: MpAccountRecord = {
        rawBookID: syncData.rawBookID,
        accountTitle: syncData.accountInfo.accountTitle,
        accountIntro: syncData.accountInfo.accountIntro,
        accountCover: syncData.accountInfo.accountCover,
      };
      if (avID) {
        await ensureMpAccountInDatabase(plugin, avID, record);
      }
    } catch (e) {
      showMessage(t(plugin, "newSourcesMpImportFailed", "公众号导入失败：{title}", { title: mp.title || mp.bookID }));
    }
  }

  await mergeNewSourceDetailsIntoNotebookCache(plugin, [
    ...selectedNormalBooks,
    ...useBookIDs,
    ...selectedMpAccounts,
  ]);

  if (avID) {
    try {
      await reloadAttributeView(avID);
    } catch {
      // 刷新失败不影响主流程
    }
  }

  await waitForImportedSourcesReady(plugin, [
    ...selectedNormalBooks,
    ...useBookIDs,
    ...selectedMpAccounts,
  ], avID);
}
