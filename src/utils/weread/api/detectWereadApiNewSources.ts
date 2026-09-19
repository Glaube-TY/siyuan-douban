import { sql, getAttributeView } from "@/api";
import { getAttributeViewValueText, normalizeBookTitle } from "../../bookHandling/bookDeduplication";
import { findBookPrimaryKeyValue } from "../../bookHandling/bookDatabasePrimaryKey";
import { isValidISBN, normalizeISBN } from "../../bookHandling/isbn";
import PromiseLimitPool from "@/libs/promise-pool";
import { getIgnoredBookIDSet, getWereadStorageKey, loadIgnoredBooks } from "../wereadSyncStorage";
import { buildWereadApiDatabaseBookDetail } from "./buildWereadApiDatabaseBookDetail";
import type { WereadSyncProgressCallback } from "./wereadSyncProgress";
import { t } from "@/utils/i18n";

interface WereadPluginLike {
  loadData: (key: string) => Promise<any>;
  saveData: (key: string, value: any) => Promise<void>;
}

export interface WereadApiNewSourceItem {
  title: string;
  isbn: string;
  bookID: string;
  author?: string;
  cover?: string;
  introduction?: string;
  noteCount?: number;
  reviewCount?: number;
  sourceType?: string;
  publisher?: string;
  publishTime?: string;
  category?: string;
}

export interface DetectWereadApiNewSourcesOptions {
  apiKey: string;
  onProgress?: WereadSyncProgressCallback;
}

function getValueText(v: any): string {
  return String(
    v?.text?.content ??
    v?.block?.content ??
    v?.number?.formattedContent ??
    v?.number?.content ??
    ""
  ).trim();
}

async function enrichMissingISBNs(
  plugin: WereadPluginLike,
  apiKey: string,
  items: WereadApiNewSourceItem[],
  onProgress?: WereadSyncProgressCallback,
): Promise<WereadApiNewSourceItem[]> {
  const detailCandidates = items.filter((item) => !isValidISBN(item.isbn));
  if (detailCandidates.length === 0) return items;

  const pool = new PromiseLimitPool<WereadApiNewSourceItem>(2);
  let completed = 0;

  for (const item of detailCandidates) {
    pool.add(async () => {
      let enriched = item;
      try {
        const detail = await buildWereadApiDatabaseBookDetail(apiKey, item.bookID);
        enriched = {
          ...item,
          isbn: detail.isbn || item.isbn,
          title: detail.title || item.title,
          author: detail.author || item.author,
          cover: detail.cover || item.cover,
          introduction: detail.intro || item.introduction,
          publisher: detail.publisher || item.publisher,
          publishTime: detail.publishTime || item.publishTime,
        };
      } catch {
        console.warn(`[detectWereadApiNewSources] 书籍详情补全失败，保留缓存数据: ${item.bookID}`);
      } finally {
        completed += 1;
        try {
          onProgress?.({
            stage: "planning",
            sourceType: "book",
            index: completed,
            total: detailCandidates.length,
            message: t(plugin, "newSourcesEnriching", "正在补全新书资料（{completed}/{total}）...", {
              completed,
              total: detailCandidates.length,
            }),
            status: "running",
          });
        } catch {
          // 进度回调不应影响其他书籍的资料补全。
        }
      }
      return enriched;
    });
  }

  const enrichedItems = await pool.awaitAll();
  const enrichedByBookID = new Map(enrichedItems.map((item) => [item.bookID, item]));
  return items.map((item) => enrichedByBookID.get(item.bookID) || item);
}

export async function detectWereadApiNewSources(
  plugin: WereadPluginLike,
  options: DetectWereadApiNewSourcesOptions,
): Promise<{
  newSources: WereadApiNewSourceItem[];
  normalBooks: WereadApiNewSourceItem[];
  mpAccounts: WereadApiNewSourceItem[];
}> {
  const notebooksList = await plugin.loadData("temporary_weread_notebooksList");
  if (!Array.isArray(notebooksList) || notebooksList.length === 0) {
    return { newSources: [], normalBooks: [], mpAccounts: [] };
  }

  const settings = await plugin.loadData("settings.json") || {};
  const databaseBlockId = settings?.bookDatabaseID || "";
  if (!databaseBlockId) {
    return { newSources: [], normalBooks: [], mpAccounts: [] };
  }

  const blockResult = await sql(`SELECT * FROM blocks WHERE id = "${databaseBlockId}"`);
  const avID = blockResult[0]?.markdown?.match(/data-av-id="([^"]+)"/)?.[1] || "";
  if (!avID) {
    return { newSources: [], normalBooks: [], mpAccounts: [] };
  }

  const db = await getAttributeView(avID);
  const keyValues = db?.av?.keyValues || [];

  const bookNameKey = findBookPrimaryKeyValue(keyValues);
  const isbnKey = keyValues.find((kv: any) => kv.key?.name === "ISBN");
  const bookIDKey = keyValues.find((kv: any) => kv.key?.name === "bookID");

  const bookNameBlockIDs = new Set<string>(
    (bookNameKey?.values || []).map((item: any) => item.blockID)
  );
  const validBookTitlesInDB = new Set<string>(
    (bookNameKey?.values || [])
      .map((item: any) => normalizeBookTitle(getAttributeViewValueText(item)))
      .filter(Boolean)
  );

  const validISBNsInDB = new Set<string>();
  for (const item of isbnKey?.values || []) {
    if (bookNameBlockIDs.has(item.blockID)) {
      const isbn = normalizeISBN(getValueText(item));
      if (isValidISBN(isbn)) validISBNsInDB.add(isbn);
    }
  }

  const validBookIDsInDB = new Set<string>();
  for (const item of bookIDKey?.values || []) {
    if (bookNameBlockIDs.has(item.blockID)) {
      const bookID = getValueText(item);
      if (bookID) validBookIDsInDB.add(bookID);
    }
  }

  const ignoredBooks = await loadIgnoredBooks(plugin);
  const syncedNotebooks = await plugin.loadData("weread_notebooks");
  const syncedBookIDSet = new Set<string>(
    (Array.isArray(syncedNotebooks) ? syncedNotebooks : [])
      .map(getWereadStorageKey)
      .filter(Boolean)
  );
  const ignoredBookIDs = getIgnoredBookIDSet(ignoredBooks);
  const ignoredISBNs = new Set<string>(
    ignoredBooks
      .filter((record: any) => !syncedBookIDSet.has(getWereadStorageKey(record)))
      .map((b: any) => b.isbn?.toString())
      .filter(Boolean)
      .map((isbn: string) => normalizeISBN(isbn))
      .filter(isValidISBN)
  );

  const customISBNBooks = await plugin.loadData("weread_customBooksISBN") || [];
  const customISBNByBookID = new Map<string, string>();
  for (const item of customISBNBooks) {
    const bookID = getWereadStorageKey(item);
    const isbn = normalizeISBN(item?.customISBN ?? item?.isbn ?? "").toUpperCase();
    if (bookID && isbn) {
      customISBNByBookID.set(bookID, isbn);
    }
  }

  const useBookIDBooks = await plugin.loadData("weread_useBookIDBooks") || [];
  const useBookIDBookIDs = new Set<string>(
    useBookIDBooks.map(getWereadStorageKey).filter(Boolean)
  );

  const candidates = notebooksList
    .map((item: any) => {
      const bookID = getWereadStorageKey(item);
      if (!bookID) return null;
      return {
        title: item?.title || "",
        isbn: item?.isbn || "",
        bookID,
        author: item?.author || "",
        cover: item?.cover || "",
        introduction: item?.introduction || "",
        noteCount: item?.noteCount ?? 0,
        reviewCount: item?.reviewCount ?? 0,
        sourceType: item?.sourceType || "",
        publisher: item?.publisher || "",
        publishTime: item?.publishTime || "",
        category: item?.category || "",
      };
    })
    .filter(Boolean) as WereadApiNewSourceItem[];

  const normalBookCandidates: WereadApiNewSourceItem[] = [];
  const mpAccounts: WereadApiNewSourceItem[] = [];

  for (const item of candidates) {
    const bookID = item.bookID;
    const normalizedTitle = normalizeBookTitle(item.title);
    const storedCustomISBN = customISBNByBookID.get(bookID) || "";
    const isbn = item.isbn || storedCustomISBN;
    const isMpAccount = item.sourceType === "weread_mp_account" || bookID.startsWith("MP_WXS_");

    if (ignoredBookIDs.has(bookID)) continue;
    if (syncedBookIDSet.has(bookID)) continue;

    if (isMpAccount) {
      if (validBookIDsInDB.has(bookID)) continue;
      mpAccounts.push({
        title: item.title,
        isbn: "",
        bookID,
        author: item.author,
        cover: item.cover,
        introduction: item.introduction,
        noteCount: item.noteCount,
        reviewCount: item.reviewCount,
        sourceType: "weread_mp_account",
      });
    } else {
      const normalizedIsbn = normalizeISBN(isbn).toUpperCase();
      if (normalizedIsbn && ignoredISBNs.has(normalizedIsbn)) continue;
      if (customISBNByBookID.has(bookID)) continue;
      if (useBookIDBookIDs.has(bookID)) continue;
      if (bookID && validBookIDsInDB.has(bookID)) continue;
      if (normalizedIsbn && validISBNsInDB.has(normalizedIsbn)) continue;
      if (normalizedTitle && validBookTitlesInDB.has(normalizedTitle)) continue;
      normalBookCandidates.push({
        title: item.title,
        isbn,
        bookID,
        author: item.author,
        cover: item.cover,
        introduction: item.introduction,
        noteCount: item.noteCount,
        reviewCount: item.reviewCount,
        sourceType: item.sourceType || "weread_book",
        publisher: item.publisher,
        publishTime: item.publishTime,
        category: item.category,
      });
    }
  }

  const enrichedNormalBooks = await enrichMissingISBNs(
    plugin,
    options.apiKey,
    normalBookCandidates,
    options.onProgress,
  );
  const normalBooks = enrichedNormalBooks.filter((item) => {
    const normalizedIsbn = normalizeISBN(item.isbn);
    if (normalizedIsbn && ignoredISBNs.has(normalizedIsbn)) return false;
    if (isValidISBN(normalizedIsbn) && validISBNsInDB.has(normalizedIsbn)) return false;

    const normalizedTitle = normalizeBookTitle(item.title);
    return !normalizedTitle || !validBookTitlesInDB.has(normalizedTitle);
  });

  return {
    newSources: [...normalBooks, ...mpAccounts],
    normalBooks,
    mpAccounts,
  };
}
