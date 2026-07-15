import { sql, getAttributeView } from "@/api";
import { ensureWereadApiNotebookCacheDetails } from "./ensureWereadApiNotebookCacheDetails";
import { getAttributeViewValueText, normalizeBookTitle } from "../../bookHandling/bookDeduplication";

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

function getValueText(v: any): string {
  return String(
    v?.text?.content ??
    v?.block?.content ??
    v?.number?.formattedContent ??
    v?.number?.content ??
    ""
  ).trim();
}

function normalizeISBN(value: any): string {
  return String(value ?? "")
    .replace(/[\s\-\u2014\u2013_]/g, "")
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .trim();
}

function getStoredBookID(record: any): string {
  return String(record?.bookID ?? record?.bookId ?? record?.syncID ?? "").trim();
}

export async function detectWereadApiNewSources(
  plugin: WereadPluginLike,
  apiKey?: string
): Promise<{
  newSources: WereadApiNewSourceItem[];
  normalBooks: WereadApiNewSourceItem[];
  mpAccounts: WereadApiNewSourceItem[];
}> {
  if (apiKey) {
    await ensureWereadApiNotebookCacheDetails(plugin, apiKey, { limit: 100 });
  }

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

  const bookNameKey = keyValues.find((kv: any) => kv.key?.name === "书名");
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
      const isbn = getValueText(item);
      if (isbn) validISBNsInDB.add(normalizeISBN(isbn).toUpperCase());
    }
  }

  const validBookIDsInDB = new Set<string>();
  for (const item of bookIDKey?.values || []) {
    if (bookNameBlockIDs.has(item.blockID)) {
      const bookID = getValueText(item);
      if (bookID) validBookIDsInDB.add(bookID);
    }
  }

  const ignoredBooks = await plugin.loadData("weread_ignoredBooks") || [];
  const ignoredBookIDs = new Set<string>(
    ignoredBooks.map((b: any) => b.bookID?.toString()).filter(Boolean)
  );
  const ignoredISBNs = new Set<string>(
    ignoredBooks
      .map((b: any) => b.isbn?.toString())
      .filter(Boolean)
      .map((isbn: string) => normalizeISBN(isbn).toUpperCase())
  );

  const customISBNBooks = await plugin.loadData("weread_customBooksISBN") || [];
  const customISBNByBookID = new Map<string, string>();
  for (const item of customISBNBooks) {
    const bookID = getStoredBookID(item);
    const isbn = normalizeISBN(item?.customISBN ?? item?.isbn ?? "").toUpperCase();
    if (bookID && isbn) {
      customISBNByBookID.set(bookID, isbn);
    }
  }

  const useBookIDBooks = await plugin.loadData("weread_useBookIDBooks") || [];
  const useBookIDBookIDs = new Set<string>(
    useBookIDBooks.map(getStoredBookID).filter(Boolean)
  );

  const candidates = notebooksList
    .map((item: any) => {
      const bookID = item?.bookID || item?.bookId || "";
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
      };
    })
    .filter(Boolean) as WereadApiNewSourceItem[];

  const normalBooks: WereadApiNewSourceItem[] = [];
  const mpAccounts: WereadApiNewSourceItem[] = [];

  for (const item of candidates) {
    const bookID = item.bookID;
    const normalizedTitle = normalizeBookTitle(item.title);
    const storedCustomISBN = customISBNByBookID.get(bookID) || "";
    const isbn = item.isbn || storedCustomISBN;
    const isMpAccount = item.sourceType === "weread_mp_account" || bookID.startsWith("MP_WXS_");

    if (isMpAccount) {
      if (validBookIDsInDB.has(bookID)) continue;
      if (ignoredBookIDs.has(bookID)) continue;
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
      if (ignoredBookIDs.has(bookID)) continue;
      if (normalizedIsbn && ignoredISBNs.has(normalizedIsbn)) continue;
      if (customISBNByBookID.has(bookID)) continue;
      if (useBookIDBookIDs.has(bookID)) continue;
      if (bookID && validBookIDsInDB.has(bookID)) continue;
      if (normalizedIsbn && validISBNsInDB.has(normalizedIsbn)) continue;
      if (normalizedTitle && validBookTitlesInDB.has(normalizedTitle)) continue;
      normalBooks.push({
        title: item.title,
        isbn,
        bookID,
        author: item.author,
        cover: item.cover,
        introduction: item.introduction,
        noteCount: item.noteCount,
        reviewCount: item.reviewCount,
        sourceType: item.sourceType || "weread_book",
      });
    }
  }

  return {
    newSources: [...normalBooks, ...mpAccounts],
    normalBooks,
    mpAccounts,
  };
}
