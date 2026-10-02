import { sql, getAttributeView } from "@/api";
import { buildBookIdentityRows } from "../../bookHandling/bookDeduplication";
import { isValidISBN, normalizeISBN } from "../../bookHandling/isbn";
import { findConflictingWereadDocBindings, getIgnoredBookIDSet, getWereadStorageKey, loadCustomISBNBooksWithMigration, loadIgnoredBooks, loadWereadSyncedNotebooks } from "../wereadSyncStorage";
import { getNoteDocumentBinding, validateNoteDocumentBindings } from "../../readingManagement/noteDocumentBinding";
import { matchWereadBookIdentity } from "./wereadBookIdentity";

interface WereadPluginLike {
  loadData: (key: string) => Promise<any>;
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

export async function detectWereadApiNewSources(plugin: WereadPluginLike): Promise<{
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
  if (!Array.isArray(db?.av?.keyValues)) throw new Error("书籍数据库列数据格式异常");
  const rows = buildBookIdentityRows(db.av.keyValues);
  const validBookIDsInDB = new Set(rows.map(row => row.bookID).filter(Boolean));
  const bindings = await validateNoteDocumentBindings(rows.map(row => row.docBlockID));

  const ignoredBooks = await loadIgnoredBooks(plugin);
  const syncedNotebooks = await loadWereadSyncedNotebooks(plugin);
  const syncedBookIDSet = new Set<string>(
    syncedNotebooks
      .map(getWereadStorageKey)
      .filter(Boolean)
  );
  const ignoredBookIDs = getIgnoredBookIDSet(ignoredBooks);

  const customISBNBooks = await loadCustomISBNBooksWithMigration(plugin);
  const customISBNByBookID = new Map<string, string>();
  for (const item of customISBNBooks) {
    const bookID = getWereadStorageKey(item);
    const isbn = normalizeISBN(item.customISBN);
    if (bookID && isValidISBN(isbn)) {
      customISBNByBookID.set(bookID, isbn);
    }
  }

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
  const localMatches = new Map(candidates.map(item => {
    const freshISBN = normalizeISBN(item.isbn);
    const isbn = isValidISBN(freshISBN) ? freshISBN : customISBNByBookID.get(item.bookID) || "";
    return [item.bookID, matchWereadBookIdentity(rows, { bookID: item.bookID, isbn }, syncedNotebooks, false)];
  }));
  const sharedTargets = findConflictingWereadDocBindings(candidates
    .filter(item => !ignoredBookIDs.has(item.bookID))
    .map(item => ({ bookID: item.bookID, sourceType: item.sourceType, blockID: localMatches.get(item.bookID)?.row?.docBlockID })));

  for (const item of candidates) {
    const bookID = item.bookID;
    const storedCustomISBN = customISBNByBookID.get(bookID) || "";
    const freshISBN = normalizeISBN(item.isbn);
    const isbn = isValidISBN(freshISBN) ? freshISBN : storedCustomISBN;
    const isMpAccount = item.sourceType === "weread_mp_account" || bookID.startsWith("MP_WXS_");

    if (ignoredBookIDs.has(bookID)) continue;
    if (isMpAccount) {
      if (syncedBookIDSet.has(bookID)) continue;
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
      // Preferences and synced history alone do not prove an independent local target.
      // New-source detection intentionally never suppresses a source by title.
      const match = localMatches.get(bookID)!;
      if (!match.issue && match.row && !sharedTargets.has(match.row.docBlockID)
        && getNoteDocumentBinding(match.row.docBlockID, bindings).state === "bound") continue;
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

  const normalBooks = normalBookCandidates;

  return {
    newSources: [...normalBooks, ...mpAccounts],
    normalBooks,
    mpAccounts,
  };
}
