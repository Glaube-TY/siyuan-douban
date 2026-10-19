import { wereadSourceKey, type WereadApprovedSyncPlan } from "./wereadApprovedSyncPlan";
import { showMessage } from "siyuan";
import { svelteDialog } from "@/libs/dialog";
import { sql, reloadAttributeView } from "@/api";
import { fetchBookHtml } from "@/utils/douban/book/getWebPage";
import { fetchDoubanBook } from "@/utils/douban/book/fetchBook";
import { isValidISBN, normalizeISBN } from "@/utils/bookHandling/isbn";
import { loadAVData } from "@/utils/bookHandling/index";
import { addUseBookIDsToDatabase } from "@/utils/weread/addUseBookIDs";
import { ensureMpAccountInDatabase, type MpAccountRecord } from "@/utils/weread/addWereadMpAccounts";
import { saveIgnoredBooks, saveCustomBooksISBN, saveUseBookIDBooks } from "@/utils/weread/wereadSyncStorage";
import { buildWereadApiDatabaseBookDetail } from "./buildWereadApiDatabaseBookDetail";
import { buildWereadApiMpAccountSyncData } from "./buildWereadApiMpAccountSyncData";
import { detectWereadApiNewSources, type WereadApiNewSourceItem } from "./detectWereadApiNewSources";
import { findWereadApiBookTargetDoc } from "./findWereadApiBookTargetDoc";
import { inspectWereadISBNSourceToDatabase, linkWereadISBNSourceToDatabase } from "./wereadBookIdentity";
import { ensureExistingBookNoteDocument } from "./ensureExistingBookNoteDocument";
import WereadNewBooks from "@/components/common/wereadNewBooksDialog.svelte";
import type { WereadSyncProgressCallback } from "./wereadSyncProgress";
import { t } from "@/utils/i18n";

interface WereadPluginLike {
  loadData: (key: string) => Promise<any>;
  saveData: (key: string, value: any) => Promise<void>;
  i18n: Record<string, string>;
}

export type WereadSyncOutcome = "completed" | "cancelled" | "failed" | "no_work";

export interface WereadPendingSyncDraft {
  interacted?: boolean;
  selectedBooks: WereadApiNewSourceItem[];
  ignoredBooks: WereadApiNewSourceItem[];
  useBookIDs: WereadApiNewSourceItem[];
  allNewSources: WereadApiNewSourceItem[];
  remoteDetails: Map<string, Awaited<ReturnType<typeof buildWereadApiDatabaseBookDetail>>>;
}

/** This dialog collects intent only. The task callback owns final confirmation and commit. */
export async function showWereadApiNewSourcesDialogAndSync(
  plugin: WereadPluginLike,
  apiKey: string,
  _mode: "all" | "update",
  runSync: (draft: WereadPendingSyncDraft) => Promise<WereadSyncOutcome>,
  onProgress?: WereadSyncProgressCallback,
  allowInteraction = true,
): Promise<WereadSyncOutcome> {
  const { newSources } = await detectWereadApiNewSources(plugin);
  const draft: WereadPendingSyncDraft = {
    selectedBooks: [], ignoredBooks: [], useBookIDs: [],
    allNewSources: structuredClone(newSources), remoteDetails: new Map(),
  };
  const settings = await plugin.loadData("weread_settings") || {};
  if (!newSources.length || settings.skipNewBookCheck === true || !allowInteraction) return runSync(draft);
  draft.interacted = true;
  onProgress?.({ stage: "confirming", total: newSources.length,
    message: t(plugin, "newSourcesFound", "发现 {count} 个新来源，等待确认处理方式...", { count: newSources.length }), status: "running" });
  return new Promise<WereadSyncOutcome>((resolve, reject) => {
    const mobile = typeof window !== "undefined" && window.matchMedia?.("(max-width: 600px)").matches;
    let submitted = false;
    async function submit(selectedBooks: WereadApiNewSourceItem[], ignoredBooks: WereadApiNewSourceItem[], useBookIDs: WereadApiNewSourceItem[]) {
      if (submitted) return;
      submitted = true;
      try {
        const seen = new Set<string>();
        for (const item of [...selectedBooks, ...ignoredBooks, ...useBookIDs]) {
          const original = newSources.find(source => source.bookID === item.bookID);
          if (!original || seen.has(item.bookID) || original.sourceType !== item.sourceType) throw new Error(t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。"));
          seen.add(item.bookID);
        }
        draft.selectedBooks = structuredClone(selectedBooks);
        draft.ignoredBooks = structuredClone(ignoredBooks);
        draft.useBookIDs = structuredClone(useBookIDs);
        dialog.close();
        resolve(await runSync(draft));
      } catch (error) {
        showMessage(t(plugin, "newSourcesProcessFailed", "处理新来源失败：{error}", { error: error?.message || t(plugin, "uiUnknownError", "未知错误") }));
        try { dialog.close(); } catch {}
        reject(error);
      }
    }
    const dialog = svelteDialog({
      title: plugin.i18n.newBooksConfirm || "确认新来源",
      width: mobile ? "100vw" : "min(920px, 94vw)", height: mobile ? "100dvh" : undefined,
      disableClose: true, hideCloseIcon: true,
      constructor: container => new WereadNewBooks({ target: container, props: {
        i18n: plugin.i18n, books: structuredClone(newSources),
        onFetchISBN: async (bookID: string) => {
          if (submitted || !newSources.some(source => source.bookID === bookID)) throw new Error("Unknown source");
          const detail = await buildWereadApiDatabaseBookDetail(apiKey, bookID);
          if (submitted || detail.bookId !== bookID) throw new Error(t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。"));
          draft.remoteDetails.set(bookID, detail);
          return { ...detail, isbn: isValidISBN(detail.isbn) ? normalizeISBN(detail.isbn) : "", introduction: detail.intro };
        },
        onConfirm: submit,
        onContinue: (ignored: WereadApiNewSourceItem[]) => submit([], ignored, []),
        onCancel: () => { if (!submitted) { submitted = true; dialog.close(); resolve("cancelled"); } },
      } }),
    });
    if (mobile) dialog.dialog.element.classList.add("siyuan-douban-mobile-subdialog");
  });
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
  if (!sources?.length) return;

  const cache = await plugin.loadData("temporary_weread_notebooksList");
  if (cache === null || cache === undefined) {
    throw new Error("temporary_weread_notebooksList 未创建，无法保存书籍详情");
  }
  if (!Array.isArray(cache)) {
    throw new Error("temporary_weread_notebooksList 格式异常，拒绝把未知状态当作空数据");
  }

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
    const normalizedIsbn = isValidISBN(rawIsbn)
      ? normalizeISBN(rawIsbn)
      : isValidISBN(item.isbn)
        ? normalizeISBN(item.isbn)
        : "";

    return {
      ...item,
      isbn: normalizedIsbn,
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

export async function commitWereadNewSources(
  plugin: WereadPluginLike,
  apiKey: string,
  selectedBooks: WereadApiNewSourceItem[],
  ignoredBooks: WereadApiNewSourceItem[],
  useBookIDs: WereadApiNewSourceItem[],
  allNewSources: WereadApiNewSourceItem[],
  remoteDetails = new Map<string, Awaited<ReturnType<typeof buildWereadApiDatabaseBookDetail>>>(),
  approvedPlan?: WereadApprovedSyncPlan,
): Promise<{ successfulBookIDs: string[]; successfulMpBookIDs: string[]; failed: Array<{ bookID: string; message: string }> }> {
  const approved = new Map(approvedPlan?.items.map(item => [wereadSourceKey(item), item.action]));
  for (const [sources, action] of [[selectedBooks, "import_isbn"], [useBookIDs, "import_bookID"], [ignoredBooks, "ignore"]] as const) {
    for (const source of sources) {
      const expectedAction = action !== "ignore" && source.sourceType === "weread_mp_account" ? "import_mp" : action;
      if (!approvedPlan || approved.get(wereadSourceKey(source)) !== expectedAction) throw new Error(t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。"));
    }
  }
  if (!approvedPlan) throw new Error(t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。"));
  const successfulSources: WereadApiNewSourceItem[] = [];
  const failed: Array<{ bookID: string; message: string }> = [];
  const selectedNormalBooks = selectedBooks.filter(b => b.sourceType !== "weread_mp_account");
  const selectedMpAccounts = selectedBooks.filter(b => b.sourceType === "weread_mp_account");
  const ignoredNormalBooks = ignoredBooks.filter(b => b.sourceType !== "weread_mp_account");
  const ignoredMpAccounts = ignoredBooks.filter(b => b.sourceType === "weread_mp_account");

  const settings = await plugin.loadData("settings.json") || {};
  const databaseBlockId = settings?.bookDatabaseID || "";
  let avID = "";
  if (databaseBlockId) {
    const blockResult = await sql(`SELECT * FROM blocks WHERE id = "${databaseBlockId}"`);
    avID = blockResult[0]?.markdown?.match(/data-av-id="([^"]+)"/)?.[1] || "";
  }

  const resolvedUseBookIDSources: WereadApiNewSourceItem[] = [];
  if (useBookIDs && useBookIDs.length > 0) {

    for (const bookItem of useBookIDs) {
      let writeAttempted = false;
      try {
        const bookDetail = remoteDetails.get(bookItem.bookID) || await buildWereadApiDatabaseBookDetail(apiKey, bookItem.bookID);
        if (bookDetail.bookId !== bookItem.bookID) {
          throw new Error(t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。"));
        }
        resolvedUseBookIDSources.push({
          ...bookItem,
          bookID: bookDetail.bookId,
          title: bookDetail.title || bookItem.title,
          isbn: bookDetail.isbn || bookItem.isbn,
          author: bookDetail.author || bookItem.author,
          introduction: bookDetail.intro || bookItem.introduction,
          publisher: bookDetail.publisher || bookItem.publisher,
          publishTime: bookDetail.publishTime || bookItem.publishTime,
          cover: bookDetail.cover || bookItem.cover,
        });
        if (avID) {
          writeAttempted = true;
          const result = await addUseBookIDsToDatabase(plugin, avID, bookDetail);
          if (result?.code !== 0) throw new Error(result?.msg || t(plugin, "uiUnknownError", "未知错误"));
          successfulSources.push(resolvedUseBookIDSources.at(-1)!);
        } else {
          throw new Error(t(plugin, "wereadBookNoteRepairFailed", "已找到本地书籍，但其读书笔记绑定异常，无法自动修复；请检查数据库配置与绑定。"));
        }
      } catch (e) {
        failed.push({ bookID: bookItem.bookID, message: writeAttempted ? t(plugin, "wereadSourcePartialWrite", "导入未完成，可能已有部分写入；已保留数据，请检查后重试：{error}", { error: e?.message || t(plugin, "uiUnknownError", "未知错误") }) : e?.message || "" });
        showMessage(t(plugin, "newSourcesBookIdImportFailed", "bookID 导入失败：{title}：{error}", { title: bookItem.title || bookItem.bookID, error: e?.message || t(plugin, "uiUnknownError", "未知错误") }));
      }
    }
  }

  const settingConfig = await plugin.loadData("settings.json") || {};
  const noteTemplate = settingConfig?.noteTemplate || "";

  for (const book of selectedNormalBooks) {
    const isbn = normalizeISBN(book.isbn);
    if (!isValidISBN(isbn)) {
      failed.push({ bookID: book.bookID, message: t(plugin, "bookIsbnInvalid", "ISBN 格式无效") });
      continue;
    }

    let writeAttempted = false;
    try {
      if (avID) {
        const target = { bookID: book.bookID, isbn };
        const existing = await inspectWereadISBNSourceToDatabase(plugin, avID, target);
        const loadDouban = async () => {
          const html = await fetchBookHtml(isbn);
          const detail = await fetchDoubanBook(html);
          if (!isValidISBN(detail.isbn) || normalizeISBN(detail.isbn) !== isbn) {
            throw new Error(t(plugin, "wereadISBNImportMismatch", "无法确认豆瓣 ISBN 与所选 ISBN 一致，已停止导入。"));
          }
          return detail;
        };
        if (existing) {
          writeAttempted = true;
          await ensureExistingBookNoteDocument(plugin, avID, existing, target, async () => {
            const detail = await loadDouban();
            return {
              title: detail.title, subtitle: detail.subtitle || "", originalTitle: detail.originalTitle || "",
              author: detail.authors.join("、"), translator: detail.translators.join("、"),
              publisher: detail.publisher || "未知出版社", publishDate: detail.publishDate || "未知日期", producer: detail.producer || "",
              isbn, binding: detail.binding || "", series: detail.series || "", doubanRating: detail.rating || "无评分",
              doubanRatingCount: detail.ratingCount || "0", pages: detail.pages || "", price: detail.price || "",
              myRating: "未评分", bookCategory: "默认分类", readingStatus: "未读", startDate: "未开始", finishDate: "未完成",
              cover: detail.cover || "", description: detail.description || "", authorBio: detail.authorBio || "",
            };
          });
          await linkWereadISBNSourceToDatabase(plugin, avID, target, existing.rowBlockID);
        } else {
          const doubanBook = await loadDouban();
          writeAttempted = true;
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
          }, plugin, { cleanupOrphans: false });
          if (result?.code !== 0) throw new Error(result?.msg || t(plugin, "uiUnknownError", "未知错误"));
          if (!result.rowBlockID) throw new Error(t(plugin, "bookUpdateVerificationFailed", "回读验证未通过"));
          await linkWereadISBNSourceToDatabase(plugin, avID, target, result.rowBlockID);
        }
        successfulSources.push({ ...book, isbn });
        showMessage(t(plugin, "newSourcesBookImported", "成功导入《{title}》", { title: book.title || isbn }));
      } else {
        throw new Error(t(plugin, "wereadBookNoteRepairFailed", "已找到本地书籍，但其读书笔记绑定异常，无法自动修复；请检查数据库配置与绑定。"));
      }
    } catch (e) {
      failed.push({ bookID: book.bookID, message: writeAttempted ? t(plugin, "wereadSourcePartialWrite", "导入未完成，可能已有部分写入；已保留数据，请检查后重试：{error}", { error: e?.message || t(plugin, "uiUnknownError", "未知错误") }) : e?.message || "" });
      showMessage(t(plugin, "newSourcesBookImportFailed", "普通书导入失败：{title}：{error}", { title: book.title || book.bookID, error: e?.message || t(plugin, "uiUnknownError", "未知错误") }));
    }
  }

  for (const mp of selectedMpAccounts) {
    let writeAttempted = false;
    try {
      const syncData = await buildWereadApiMpAccountSyncData(apiKey, mp.bookID);
      const record: MpAccountRecord = {
        rawBookID: syncData.rawBookID,
        accountTitle: syncData.accountInfo.accountTitle,
        accountIntro: syncData.accountInfo.accountIntro,
        accountCover: syncData.accountInfo.accountCover,
      };
      if (avID) {
        writeAttempted = true;
        await ensureMpAccountInDatabase(plugin, avID, record);
        successfulSources.push(mp);
      } else {
        throw new Error(t(plugin, "uiUnknownError", "未知错误"));
      }
    } catch (e) {
      failed.push({ bookID: mp.bookID, message: writeAttempted ? t(plugin, "wereadSourcePartialWrite", "导入未完成，可能已有部分写入；已保留数据，请检查后重试：{error}", { error: e?.message || t(plugin, "uiUnknownError", "未知错误") }) : e?.message || "" });
      showMessage(t(plugin, "newSourcesMpImportFailed", "公众号导入失败：{title}", { title: mp.title || mp.bookID }));
    }
  }

  if (avID) {
    try {
      await reloadAttributeView(avID);
    } catch {
      // 刷新失败不影响主流程
    }
  }

  await waitForImportedSourcesReady(plugin, successfulSources, avID);
  const successfulBookIDs: string[] = [];
  const successfulMpBookIDs: string[] = [];
  for (const source of successfulSources) {
    const result = await findWereadApiBookTargetDoc(plugin, {
      bookID: source.bookID, isbn: source.isbn, title: source.title,
    }, { cleanupOrphans: false });
    if (!result.success || !result.blockID || result.matchType !== "bookID") {
      const message = t(plugin, "wereadSourcePartialWrite", "导入未完成，可能已有部分写入；已保留数据，请检查后重试：{error}", { error: result.message || t(plugin, "bookUpdateVerificationFailed", "回读验证未通过") });
      failed.push({ bookID: source.bookID, message });
      showMessage(source.sourceType === "weread_mp_account"
        ? t(plugin, "newSourcesMpImportFailed", "公众号导入失败：{title}", { title: source.title })
        : t(plugin, "newSourcesBookImportFailed", "普通书导入失败：{title}：{error}", { title: source.title, error: message }));
      continue;
    }
    (source.sourceType === "weread_mp_account" ? successfulMpBookIDs : successfulBookIDs).push(source.bookID);
  }
  const successful = new Set([...successfulBookIDs, ...successfulMpBookIDs]);
  const verifiedSources = successfulSources.filter(source => successful.has(source.bookID));
  await saveCustomBooksISBN(plugin, verifiedSources.filter(source => selectedNormalBooks.some(book => book.bookID === source.bookID)), allNewSources);
  if (ignoredBooks.length) await saveIgnoredBooks(plugin, [...ignoredNormalBooks, ...ignoredMpAccounts]);
  const verifiedBookIDs = useBookIDs.filter(source => successful.has(source.bookID));
  if (verifiedBookIDs.length) await saveUseBookIDBooks(plugin, verifiedBookIDs);
  await mergeNewSourceDetailsIntoNotebookCache(plugin, [...selectedNormalBooks, ...resolvedUseBookIDSources, ...selectedMpAccounts]);
  return { successfulBookIDs: [...new Set(successfulBookIDs)], successfulMpBookIDs: [...new Set(successfulMpBookIDs)], failed };
}
