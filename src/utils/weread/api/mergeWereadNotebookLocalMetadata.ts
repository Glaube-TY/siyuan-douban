import { isValidISBN, normalizeISBN } from "../../bookHandling/isbn";
import { getWereadStorageKey, loadCustomISBNBooksWithMigration } from "../wereadSyncStorage";
import { loadPluginStorageJsonStateStrict, type PluginLike } from "../../storage/pluginStorageStrict";

interface WereadPluginLike extends PluginLike {
  loadData: (key: string) => Promise<any>;
}

const STABLE_METADATA_FIELDS = [
  "publisher",
  "publishTime",
  "introduction",
  "author",
  "cover",
] as const;

function readRecordArray(value: unknown, storageName: string): any[] {
  if (Array.isArray(value)) return value;
  throw new Error(`${storageName} 格式异常，拒绝把未知状态当作空数据`);
}

async function loadOptionalArrayStorageStrict(plugin: WereadPluginLike, storageName: string): Promise<any[]> {
  const state = await loadPluginStorageJsonStateStrict(plugin, storageName);
  return state.exists ? readRecordArray(state.value, storageName) : [];
}

function buildRecordMap(records: unknown, storageName: string): Map<string, any> {
  const result = new Map<string, any>();
  for (const record of readRecordArray(records, storageName)) {
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
  freshNotebooks: unknown,
): Promise<any[]> {
  if (!Array.isArray(freshNotebooks)) throw new Error("微信读书有笔记来源数据格式异常");

  const [temporaryCache, shelfCache, syncedRecords, customISBNRecords] = await Promise.all([
    loadOptionalArrayStorageStrict(plugin, "temporary_weread_notebooksList"),
    loadOptionalArrayStorageStrict(plugin, "weread_api_bookshelf_cache"),
    loadOptionalArrayStorageStrict(plugin, "weread_notebooks"),
    loadCustomISBNBooksWithMigration(plugin),
  ]);

  const temporaryByBookID = buildRecordMap(temporaryCache, "temporary_weread_notebooksList");
  const shelfByBookID = buildRecordMap(shelfCache, "weread_api_bookshelf_cache");
  const syncedByBookID = buildRecordMap(syncedRecords, "weread_notebooks");
  const customISBNByBookID = buildRecordMap(customISBNRecords, "weread_customBooksISBN");

  return freshNotebooks.map((fresh) => {
    const bookID = getWereadStorageKey(fresh);
    if (!bookID) return fresh;

    const localRecords = [
      temporaryByBookID.get(bookID),
      shelfByBookID.get(bookID),
      syncedByBookID.get(bookID),
    ].filter(Boolean);
    const customRecord = customISBNByBookID.get(bookID);
    const customISBN = getValidISBN(customRecord?.customISBN);
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
