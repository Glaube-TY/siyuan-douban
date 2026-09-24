import { isValidISBN, normalizeISBN } from "../bookHandling/isbn";
import { t } from "../i18n";

const CUSTOM_ISBN_STORAGE = "weread_customBooksISBN";
const CUSTOM_ISBN_BACKUP_STORAGE = "weread_customBooksISBN_legacy_backup_v1";

export interface WereadCustomISBNBook {
    title?: string;
    customISBN: string;
    bookID: string;
}

/**
 * 获取微信读书存储记录的唯一键
 * 统一只使用 bookID 作为主键，和数据库层/同步层口径一致
 * 
 * 过渡方案：
 * - 读取旧数据时：若记录没有 bookID，仍兼容使用 syncID（历史旧数据）
 * - 新写入/去重合并/回写：一律只基于 bookID，不再保留 syncID
 */
export function getWereadStorageKey(record: any): string {
    for (const value of [record?.bookID, record?.bookId, record?.syncID]) {
        const key = String(value ?? "").trim();
        if (key) return key;
    }
    return "";
}

/**
 * 规范化存储记录，确保只保留 bookID 作为主键
 * 用于保存前清理历史遗留的 syncID，避免口径差异
 */
function normalizeStorageRecord(record: any): any {
    if (!record || typeof record !== "object") return record;
    const bookID = getWereadStorageKey(record);
    const { syncID, bookId, ...rest } = record;
    return bookID ? { ...rest, bookID } : rest;
}

function isPlainObject(value: unknown): value is Record<string, any> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function hasOwn(record: Record<string, any>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key);
}

function storageType(value: unknown): string {
    return Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
}

function storageShape(value: unknown): string {
    if (Array.isArray(value)) return `array length=${value.length}`;
    if (isPlainObject(value)) return `plain object keys=${Object.keys(value).length}`;
    if (typeof value === "string") return `string length=${value.length}`;
    return storageType(value);
}

function customISBNFormatError(plugin: any, value: unknown, detail: string): Error {
    const error = new Error(t(
        plugin,
        "wereadCustomISBNStorageFormatError",
        "自定义 ISBN 数据格式无法自动迁移，请先备份后检查数据。（存储：{storage}；实际类型：{type}；结构摘要：{summary}；原因：{detail}）",
        {
            storage: CUSTOM_ISBN_STORAGE,
            type: storageType(value),
            summary: storageShape(value),
            detail,
        },
    ));
    error.name = "WereadCustomISBNStorageError";
    return error;
}

function customISBNStorageOperationError(plugin: any, detail: string): Error {
    const error = new Error(t(
        plugin,
        "wereadCustomISBNStorageOperationError",
        "自定义 ISBN 数据迁移或保存失败，操作已停止。（存储：{storage}；原因：{detail}）",
        { storage: CUSTOM_ISBN_STORAGE, detail },
    ));
    error.name = "WereadCustomISBNStorageError";
    return error;
}

function normalizeCustomISBNRecord(
    plugin: any,
    value: unknown,
    snapshot: unknown,
    context: string,
    fallbackBookID?: string,
): WereadCustomISBNBook {
    if (!isPlainObject(value)) {
        throw customISBNFormatError(plugin, snapshot, `${context} must be a plain object`);
    }

    const identifierValues: string[] = [];
    for (const field of ["bookID", "bookId", "syncID"]) {
        const id = value[field];
        if (id === null || id === undefined || id === "") continue;
        if ((typeof id !== "string" && typeof id !== "number") || (typeof id === "number" && !Number.isFinite(id))) {
            throw customISBNFormatError(plugin, snapshot, `${context} has an invalid ${field}`);
        }
        const normalizedID = String(id).trim();
        if (normalizedID) identifierValues.push(normalizedID);
    }

    const uniqueIDs = new Set(identifierValues);
    if (uniqueIDs.size > 1) {
        throw customISBNFormatError(plugin, snapshot, `${context} has conflicting bookID/bookId/syncID values`);
    }

    const storedBookID = getWereadStorageKey(value);
    const parentBookID = String(fallbackBookID ?? "").trim();
    if (storedBookID && parentBookID && storedBookID !== parentBookID) {
        throw customISBNFormatError(plugin, snapshot, `${context} conflicts with its object entry key`);
    }
    const bookID = storedBookID || parentBookID;
    if (!bookID) {
        throw customISBNFormatError(plugin, snapshot, `${context} is missing bookID/bookId/syncID`);
    }

    const readISBN = (field: "customISBN" | "isbn"): string | undefined => {
        const rawISBN = value[field];
        if (rawISBN === null || rawISBN === undefined) return undefined;
        if ((typeof rawISBN !== "string" && typeof rawISBN !== "number") || (typeof rawISBN === "number" && !Number.isFinite(rawISBN))) {
            throw customISBNFormatError(plugin, snapshot, `${context} has an invalid ${field} value`);
        }
        return normalizeISBN(rawISBN);
    };

    const customISBN = readISBN("customISBN");
    const legacyISBN = readISBN("isbn");
    if (customISBN !== undefined && legacyISBN !== undefined && customISBN !== legacyISBN) {
        throw customISBNFormatError(plugin, snapshot, `${context} has conflicting customISBN/isbn values`);
    }
    const normalizedISBN = customISBN ?? legacyISBN;
    if (normalizedISBN === undefined) {
        throw customISBNFormatError(plugin, snapshot, `${context} is missing customISBN/isbn`);
    }

    if (value.title !== null && value.title !== undefined && typeof value.title !== "string") {
        throw customISBNFormatError(plugin, snapshot, `${context} has an invalid title value`);
    }

    const normalized = normalizeStorageRecord({
        ...value,
        customISBN: normalizedISBN,
        bookID,
    });
    delete normalized.isbn;
    if (value.title === null || value.title === undefined) delete normalized.title;
    return normalized as WereadCustomISBNBook;
}

function isCanonicalCustomISBNRecord(value: unknown, normalized: WereadCustomISBNBook): boolean {
    return isPlainObject(value)
        && hasOwn(value, "bookID")
        && typeof value.bookID === "string"
        && value.bookID === normalized.bookID
        && hasOwn(value, "customISBN")
        && typeof value.customISBN === "string"
        && value.customISBN === normalized.customISBN
        && !hasOwn(value, "bookId")
        && !hasOwn(value, "syncID")
        && !hasOwn(value, "isbn")
        && (!hasOwn(value, "title") || typeof value.title === "string");
}

function normalizeCustomISBNArray(
    plugin: any,
    value: unknown,
): { records: WereadCustomISBNBook[]; needsMigration: boolean } {
    if (!Array.isArray(value)) {
        throw customISBNFormatError(plugin, value, "expected an array of custom ISBN records");
    }

    let needsMigration = false;
    const records = value.map((record, index) => {
        const normalized = normalizeCustomISBNRecord(plugin, record, value, `record #${index + 1}`);
        if (!isCanonicalCustomISBNRecord(record, normalized)) needsMigration = true;
        return normalized;
    });
    return { records, needsMigration };
}

async function saveLegacyCustomISBNBackup(plugin: any, raw: unknown): Promise<void> {
    let existingBackup: unknown;
    try {
        existingBackup = await plugin.loadData(CUSTOM_ISBN_BACKUP_STORAGE);
    } catch {
        throw customISBNStorageOperationError(plugin, "legacy backup could not be checked");
    }
    if (existingBackup !== null && existingBackup !== undefined) return;

    try {
        await plugin.saveData(CUSTOM_ISBN_BACKUP_STORAGE, raw);
    } catch {
        throw customISBNStorageOperationError(plugin, "legacy backup could not be written; migration aborted");
    }

    let savedBackup: unknown;
    try {
        savedBackup = await plugin.loadData(CUSTOM_ISBN_BACKUP_STORAGE);
    } catch {
        throw customISBNStorageOperationError(plugin, "legacy backup could not be verified; migration aborted");
    }
    if (JSON.stringify(savedBackup) !== JSON.stringify(raw)) {
        throw customISBNStorageOperationError(plugin, "legacy backup verification failed; migration aborted");
    }
}

export async function loadCustomISBNBooksWithMigration(plugin: any): Promise<WereadCustomISBNBook[]> {
    let raw: unknown;
    try {
        raw = await plugin.loadData(CUSTOM_ISBN_STORAGE);
    } catch {
        throw customISBNStorageOperationError(plugin, "storage could not be read");
    }
    if (raw === null || raw === undefined) return [];

    let records: WereadCustomISBNBook[];
    let needsMigration = false;
    let isNonEmptyLegacyValue = false;

    if (Array.isArray(raw)) {
        const normalized = normalizeCustomISBNArray(plugin, raw);
        records = normalized.records;
        needsMigration = normalized.needsMigration;
        isNonEmptyLegacyValue = raw.length > 0;
    } else if (isPlainObject(raw)) {
        needsMigration = true;
        const entries = Object.entries(raw);
        isNonEmptyLegacyValue = entries.length > 0;
        if (entries.length === 0) {
            records = [];
        } else if (["bookID", "bookId", "syncID"].some((field) => hasOwn(raw, field))) {
            records = [normalizeCustomISBNRecord(plugin, raw, raw, "single record")];
        } else {
            records = entries.map(([entryKey, record], index) => {
                if (!isPlainObject(record)) {
                    throw customISBNFormatError(plugin, raw, `entry #${index + 1} must contain a record object`);
                }
                const bookID = entryKey.trim();
                if (!bookID) {
                    throw customISBNFormatError(plugin, raw, `entry #${index + 1} has an empty object key`);
                }
                return normalizeCustomISBNRecord(plugin, record, raw, `entry #${index + 1}`, bookID);
            });
        }
    } else {
        throw customISBNFormatError(plugin, raw, "unrecognized storage structure");
    }

    if (!needsMigration) return records;
    if (isNonEmptyLegacyValue) await saveLegacyCustomISBNBackup(plugin, raw);

    try {
        await plugin.saveData(CUSTOM_ISBN_STORAGE, records);
    } catch {
        throw customISBNStorageOperationError(plugin, "canonical storage could not be written; legacy backup is preserved when present");
    }

    let verified: unknown;
    try {
        verified = await plugin.loadData(CUSTOM_ISBN_STORAGE);
    } catch {
        throw customISBNStorageOperationError(plugin, "canonical storage could not be read back; legacy backup is preserved when present");
    }
    if (!Array.isArray(verified) || JSON.stringify(verified) !== JSON.stringify(records)) {
        throw customISBNStorageOperationError(plugin, "canonical array readback verification failed; legacy backup is preserved when present");
    }
    return records;
}

export async function replaceCustomISBNBooks(plugin: any, books: unknown): Promise<void> {
    if (!Array.isArray(books)) {
        throw customISBNFormatError(plugin, books, "replacement value must be an array");
    }
    await loadCustomISBNBooksWithMigration(plugin);

    const deduplicated = new Map<string, WereadCustomISBNBook>();
    books.forEach((book, index) => {
        const normalized = normalizeCustomISBNRecord(plugin, book, books, `replacement record #${index + 1}`);
        deduplicated.set(normalized.bookID, normalized);
    });
    const canonicalBooks = Array.from(deduplicated.values());

    try {
        await plugin.saveData(CUSTOM_ISBN_STORAGE, canonicalBooks);
    } catch {
        throw customISBNStorageOperationError(plugin, "canonical storage could not be written");
    }

    let verified: unknown;
    try {
        verified = await plugin.loadData(CUSTOM_ISBN_STORAGE);
    } catch {
        throw customISBNStorageOperationError(plugin, "canonical storage could not be read back");
    }
    if (!Array.isArray(verified) || JSON.stringify(verified) !== JSON.stringify(canonicalBooks)) {
        throw customISBNStorageOperationError(plugin, "canonical array readback verification failed");
    }
}

function normalizeIgnoredBooks(records: any[]): any[] {
    const uniqueMap = new Map<string, any>();
    for (const record of Array.isArray(records) ? records : []) {
        const key = getWereadStorageKey(record);
        if (!key) continue;
        uniqueMap.set(key, normalizeStorageRecord(record));
    }
    return Array.from(uniqueMap.values());
}

export async function loadIgnoredBooks(plugin: any): Promise<any[]> {
    const records = await plugin.loadData("weread_ignoredBooks");
    return Array.isArray(records) ? records : [];
}

export function getIgnoredBookIDSet(ignoredBooks: any[] | null | undefined): Set<string> {
    const bookIDs = new Set<string>();
    for (const record of Array.isArray(ignoredBooks) ? ignoredBooks : []) {
        const bookID = getWereadStorageKey(record);
        if (bookID) bookIDs.add(bookID);
    }
    return bookIDs;
}

export async function replaceIgnoredBooks(plugin: any, records: any[]): Promise<void> {
    await plugin.saveData("weread_ignoredBooks", normalizeIgnoredBooks(records));
}

export async function saveIgnoredBooks(plugin: any, newIgnoredBooks: any[]) {
    const existingIgnored = await loadIgnoredBooks(plugin);
    await replaceIgnoredBooks(plugin, [...existingIgnored, ...(Array.isArray(newIgnoredBooks) ? newIgnoredBooks : [])]);
}

// 保存自定义书籍ISBN
export async function saveCustomBooksISBN(plugin: any, selectedBooks: any[], cloudNotebooksList: any[]) {
    const customBooks = selectedBooks
        .filter(book => {
            const originalBook = cloudNotebooksList.find(original => original.bookID === book.bookID);
            const shouldSave = originalBook
                && !isValidISBN(originalBook.isbn)
                && isValidISBN(book.isbn);
            return shouldSave;
        })
        .map(({ title, isbn, bookID }) => ({
            title,
            customISBN: normalizeISBN(isbn),
            bookID: bookID,
        }));

    if (customBooks.length > 0) {
        const existingCustom = await loadCustomISBNBooksWithMigration(plugin);
        const merged = [...existingCustom, ...customBooks];
        const customMap = new Map();
        merged.forEach((item, index) => {
            const key = getWereadStorageKey(item);
            if (!key) {
                throw customISBNFormatError(plugin, merged, `record #${index + 1} is missing bookID/bookId/syncID`);
            }
            customMap.set(key, normalizeStorageRecord({ ...item, bookID: key }));
        });
        await replaceCustomISBNBooks(plugin, Array.from(customMap.values()));
    }
}

// 保存使用bookID同步的书籍信息
export async function saveUseBookIDBooks(plugin: any, useBookIDBooks: any[]) {
    const existingUseBookID = await plugin.loadData("weread_useBookIDBooks") || [];

    const merged = [...existingUseBookID, ...useBookIDBooks];
    const useBookIDMap = new Map();
    merged.forEach(book => {
        const key = getWereadStorageKey(book);
        if (key) {
            useBookIDMap.set(key, book);
        }
    });

    // 回写时统一清理 syncID，只保留 bookID 作为主键
    const finalUseBookIDBooks = Array.from(useBookIDMap.values()).map(normalizeStorageRecord);

    await plugin.saveData("weread_useBookIDBooks", finalUseBookIDBooks);
}
