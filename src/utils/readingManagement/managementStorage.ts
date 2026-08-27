import type { ReadingInboxItem } from "../../types/readingInbox";
import type { ReadingBookStatus } from "../../types/readingStatus";
import type { WereadSyncReport } from "../../types/syncReport";
import {
    STORAGE_KEYS,
    normalizeBookStatus,
} from "../storage/readingStorage";
import {
    createEmptyWereadNoteUnitBlockIndex,
    WEREAD_NOTE_UNIT_BLOCK_INDEX_KEY,
} from "../weread/incremental/blockIndexStorage";
import type { WereadNoteUnitBlockIndex } from "../weread/incremental/types";
import { loadPluginStorageJsonStateStrict } from "../storage/pluginStorageStrict";

const NOTEBOOK_CACHE_KEY = "temporary_weread_notebooksList";
const NOTEBOOK_RECORDS_KEY = "weread_notebooks";
const AUTH_SETTINGS_KEY = "weread_auth_settings";

export async function loadReadingInboxItemsStrict(plugin: any): Promise<ReadingInboxItem[]> {
    const items = await loadStrictArray<ReadingInboxItem>(plugin, STORAGE_KEYS.inboxItems);
    return items.filter((item) => item?.id && item?.sourceKey);
}

export async function loadReadingInboxItemsForMutationStrict(plugin: any): Promise<ReadingInboxItem[]> {
    const items = await loadStrictArray<unknown>(plugin, STORAGE_KEYS.inboxItems);
    const ids = new Set<string>();
    for (const item of items) {
        if (!isPlainObject(item) || !isNonEmptyString(item.id) || !isNonEmptyString(item.sourceKey)) {
            throw new Error("reading_inbox_items 中存在无法识别的记录，为避免数据丢失已取消写入。");
        }
        if (ids.has(item.id)) {
            throw new Error("reading_inbox_items 中存在重复 id，为避免数据丢失已取消写入。");
        }
        ids.add(item.id);
    }
    return items as ReadingInboxItem[];
}

export async function loadReadingBookStatusesStrict(plugin: any): Promise<ReadingBookStatus[]> {
    const items = await loadStrictArray<ReadingBookStatus>(plugin, STORAGE_KEYS.bookStatuses);
    return items
        .filter((item) => item?.sourceKey)
        .map((item) => ({
            ...item,
            status: normalizeBookStatus(item.status),
            updatedAt: item.updatedAt || Date.now(),
        }));
}

export async function loadReadingBookStatusesForMutationStrict(plugin: any): Promise<ReadingBookStatus[]> {
    const items = await loadStrictArray<unknown>(plugin, STORAGE_KEYS.bookStatuses);
    const sourceKeys = new Set<string>();
    for (const item of items) {
        if (!isPlainObject(item) || !isNonEmptyString(item.sourceKey)) {
            throw new Error("reading_book_statuses 中存在无法识别的记录，为避免数据丢失已取消写入。");
        }
        if (sourceKeys.has(item.sourceKey)) {
            throw new Error("reading_book_statuses 中存在重复 sourceKey，为避免数据丢失已取消写入。");
        }
        sourceKeys.add(item.sourceKey);
    }
    return (items as ReadingBookStatus[]).map((item) => ({
        ...item,
        status: normalizeBookStatus(item.status),
        updatedAt: item.updatedAt || Date.now(),
    }));
}

export function loadWereadSyncReportsStrict(plugin: any): Promise<WereadSyncReport[]> {
    return loadStrictArray<WereadSyncReport>(plugin, STORAGE_KEYS.syncReports);
}

export async function loadLatestWereadSyncReportStrict(plugin: any): Promise<WereadSyncReport | null> {
    const reports = await loadWereadSyncReportsStrict(plugin);
    return [...reports].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0] || null;
}

export function loadNotebookCacheStrict(plugin: any): Promise<any[]> {
    return loadStrictArray<any>(plugin, NOTEBOOK_CACHE_KEY);
}

export async function loadWereadNoteUnitBlockIndexStrict(plugin: any): Promise<WereadNoteUnitBlockIndex> {
    const state = await loadPluginStorageJsonStateStrict(plugin, WEREAD_NOTE_UNIT_BLOCK_INDEX_KEY);
    if (!state.exists) return createEmptyWereadNoteUnitBlockIndex();

    const value = state.value;
    if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.sources)) {
        throw new Error("微信读书块索引格式无效");
    }

    return {
        schemaVersion: 1,
        updatedAt: Number(value.updatedAt || Date.now()),
        sources: value.sources as WereadNoteUnitBlockIndex["sources"],
    };
}

export function loadWereadNotebookRecordsStrict(plugin: any): Promise<any[]> {
    return loadStrictArray<any>(plugin, NOTEBOOK_RECORDS_KEY);
}

export async function loadWereadAuthSettingsStrict(plugin: any): Promise<Record<string, any>> {
    const state = await loadPluginStorageJsonStateStrict(plugin, AUTH_SETTINGS_KEY);
    if (!state.exists) return {};
    if (!isPlainObject(state.value)) {
        throw new Error(`插件存储格式无效：${AUTH_SETTINGS_KEY} 必须是普通对象`);
    }
    return state.value;
}

export function saveReadingInboxItemsStrict(plugin: any, items: ReadingInboxItem[]): Promise<void> {
    return saveStrictArrayAndVerify(plugin, STORAGE_KEYS.inboxItems, items, (item) => item.id);
}

export function saveReadingBookStatusesStrict(plugin: any, statuses: ReadingBookStatus[]): Promise<void> {
    return saveStrictArrayAndVerify(plugin, STORAGE_KEYS.bookStatuses, statuses, (status) => status.sourceKey);
}

export function saveWereadSyncReportsStrict(plugin: any, reports: WereadSyncReport[]): Promise<void> {
    return saveStrictArrayAndVerify(plugin, STORAGE_KEYS.syncReports, reports, (report) => report.id);
}

async function loadStrictArray<T>(plugin: any, storageName: string): Promise<T[]> {
    const state = await loadPluginStorageJsonStateStrict(plugin, storageName);
    if (!state.exists) return [];
    if (!Array.isArray(state.value)) {
        throw new Error(`插件存储格式无效：${storageName} 必须是数组`);
    }
    return state.value as T[];
}

async function saveStrictArrayAndVerify<T>(
    plugin: any,
    storageName: string,
    items: T[],
    getId: (item: T) => unknown,
): Promise<void> {
    const expectedIds = collectStrictKeys(items, getId, storageName);
    await plugin.saveData(storageName, items);
    const state = await loadPluginStorageJsonStateStrict(plugin, storageName);
    if (!state.exists || !Array.isArray(state.value)) {
        throw new Error(`保存后验证失败：${storageName}`);
    }

    if (state.value.length !== items.length) {
        throw new Error(`保存后验证失败：${storageName}`);
    }
    const actualIds = collectStrictKeys(state.value as T[], getId, storageName);
    if (expectedIds.size !== actualIds.size || [...expectedIds].some((id) => !actualIds.has(id))) {
        throw new Error(`保存后验证失败：${storageName}`);
    }
}

function collectStrictKeys<T>(items: T[], getId: (item: T) => unknown, storageName: string): Set<string> {
    let keys: unknown[];
    try {
        keys = items.map((item) => getId(item));
    } catch {
        throw new Error(`保存后验证失败：${storageName}`);
    }
    if (keys.some((key) => !isNonEmptyString(key))) {
        throw new Error(`保存后验证失败：${storageName}`);
    }
    const keySet = new Set(keys as string[]);
    if (keySet.size !== keys.length) {
        throw new Error(`保存后验证失败：${storageName}`);
    }
    return keySet;
}

function isRecord(value: unknown): value is Record<string, any> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, any> {
    if (!isRecord(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}
