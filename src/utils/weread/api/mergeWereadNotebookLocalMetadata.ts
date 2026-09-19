import { isValidISBN, normalizeISBN } from "../../bookHandling/isbn";
import { getWereadStorageKey } from "../wereadSyncStorage";

interface WereadPluginLike {
  loadData: (key: string) => Promise<any>;
}

const STABLE_METADATA_FIELDS = [
  "publisher",
  "publishTime",
  "introduction",
  "author",
  "cover",
] as const;

function asRecords(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function buildRecordMap(records: unknown): Map<string, any> {
  const result = new Map<string, any>();
  for (const record of asRecords(records)) {
    const bookID = getWereadStorageKey(record);
    if (bookID) result.set(bookID, record);
  }
  return result;
}

function getText(value: unknown): string {
  return String(value ?? "").trim();
}

function getValidISBN(value: unknown): string {
  const isbn = normalizeISBN(value);
  return isValidISBN(isbn) ? isbn : "";
}

export async function mergeWereadNotebookLocalMetadata(
  plugin: WereadPluginLike,
  freshNotebooks: any[],
): Promise<any[]> {
  if (!Array.isArray(freshNotebooks)) return [];

  const [temporaryCache, shelfCache, syncedRecords, customISBNRecords] = await Promise.all([
    plugin.loadData("temporary_weread_notebooksList"),
    plugin.loadData("weread_api_bookshelf_cache"),
    plugin.loadData("weread_notebooks"),
    plugin.loadData("weread_customBooksISBN"),
  ]);

  const temporaryByBookID = buildRecordMap(temporaryCache);
  const shelfByBookID = buildRecordMap(shelfCache);
  const syncedByBookID = buildRecordMap(syncedRecords);
  const customISBNByBookID = buildRecordMap(customISBNRecords);

  return freshNotebooks.map((fresh) => {
    const bookID = getWereadStorageKey(fresh);
    if (!bookID) return fresh;

    const localRecords = [
      temporaryByBookID.get(bookID),
      shelfByBookID.get(bookID),
      syncedByBookID.get(bookID),
    ].filter(Boolean);
    const customRecord = customISBNByBookID.get(bookID);
    const customISBN = getValidISBN(customRecord?.customISBN ?? customRecord?.isbn);
    const isbn = [
      customISBN,
      getValidISBN(fresh?.isbn),
      ...localRecords.map((record) => getValidISBN(record?.isbn)),
    ].find(Boolean) || "";

    const merged = { ...fresh, bookID, isbn };
    if (!getText(fresh?.title)) {
      merged.title = localRecords.map((record) => getText(record?.title)).find(Boolean) || "";
    }

    for (const field of STABLE_METADATA_FIELDS) {
      if (!getText(fresh?.[field])) {
        merged[field] = localRecords.map((record) => getText(record?.[field])).find(Boolean) || "";
      }
    }

    return merged;
  });
}
