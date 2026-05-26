import { callWereadApi } from "./wereadApiGateway";
import type { RawBookInfoResponse } from "./types/raw";
import PromiseLimitPool from "@/libs/promise-pool";

interface WereadPluginLike {
  loadData: (key: string) => Promise<any>;
  saveData: (key: string, value: any) => Promise<void>;
}

function getStoredBookID(record: any): string {
  return String(record?.bookID ?? record?.bookId ?? record?.syncID ?? "").trim();
}

function normalizeISBN(value: any): string {
  return String(value ?? "")
    .replace(/[\s\-\u2014\u2013_]/g, "")
    .replace(/[０-９Ｘｘ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .trim();
}

export async function ensureWereadApiNotebookCacheDetails(
  plugin: WereadPluginLike,
  apiKey: string,
  options?: { limit?: number }
): Promise<any[]> {
  const cache = await plugin.loadData("temporary_weread_notebooksList");
  if (!Array.isArray(cache) || cache.length === 0) return [];

  const limit = options?.limit ?? 100;

  const updatedCache = cache.map((item: any) => ({ ...item }));

  const customISBNBooks = await plugin.loadData("weread_customBooksISBN") || [];
  const customISBNByBookID = new Map<string, string>();
  for (const item of customISBNBooks) {
    const bookID = getStoredBookID(item);
    const isbn = normalizeISBN(item?.customISBN ?? item?.isbn ?? "");
    if (bookID && isbn) {
      customISBNByBookID.set(bookID, isbn);
    }
  }

  for (const item of updatedCache) {
    const bookID = getStoredBookID(item);
    const customISBN = customISBNByBookID.get(bookID);
    if (customISBN && !item.isbn) {
      item.isbn = customISBN;
    }
  }

  // 先筛选候选：缺 isbn 的普通书
  const candidates: { index: number; bookID: string }[] = [];
  for (let i = 0; i < updatedCache.length; i++) {
    const item = updatedCache[i];
    const bookID = item?.bookID || item?.bookId || "";
    if (!bookID) continue;

    const sourceType = item?.sourceType || "";
    const isMpAccount = sourceType === "weread_mp_account" || bookID.startsWith("MP_WXS_");
    if (isMpAccount) continue;

    if (item.isbn) continue;

    candidates.push({ index: i, bookID });
  }

  // 截取 limit 数量，避免竞态
  const limitedCandidates = candidates.slice(0, limit);

  if (limitedCandidates.length === 0) {
    await plugin.saveData("temporary_weread_notebooksList", updatedCache);
    return updatedCache;
  }

  // 并发请求 /book/info（并发数 4）
  type EnrichResult = { index: number; bookInfo: RawBookInfoResponse | null };
  const pool = new PromiseLimitPool<EnrichResult>(4);

  for (const candidate of limitedCandidates) {
    pool.add(async () => {
      try {
        const bookInfo = await callWereadApi<RawBookInfoResponse>(apiKey, "/book/info", { bookId: candidate.bookID });
        return { index: candidate.index, bookInfo };
      } catch {
        return { index: candidate.index, bookInfo: null };
      }
    });
  }

  const results = await pool.awaitAll();

  let enrichedCount = 0;
  for (const result of results) {
    if (result.bookInfo && result.bookInfo.isbn) {
      const i = result.index;
      updatedCache[i] = {
        ...updatedCache[i],
        isbn: result.bookInfo.isbn,
        author: result.bookInfo.author || updatedCache[i].author,
        cover: result.bookInfo.cover || updatedCache[i].cover,
        introduction: result.bookInfo.intro || updatedCache[i].introduction,
        publisher: result.bookInfo.publisher || updatedCache[i].publisher,
        publishTime: result.bookInfo.publishTime || updatedCache[i].publishTime,
        category: result.bookInfo.category || updatedCache[i].category,
      };
      enrichedCount++;
    }
  }

  await plugin.saveData("temporary_weread_notebooksList", updatedCache);
  return updatedCache;
}
