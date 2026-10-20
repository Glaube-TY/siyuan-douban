import { tryAcquireWereadStorageWrite, wereadStorageFingerprint as fingerprint } from "./wereadStorageWriteGuard";
export { wereadManagementSourceType, validateWereadManagementRecords } from "./wereadSyncStorage";
import { loadPluginStorageJsonStateStrict } from "../storage/pluginStorageStrict";
import { loadCustomISBNBooksWithMigration, replaceCustomISBNBooks, validateWereadManagementRecords } from "./wereadSyncStorage";
import { t } from "../i18n";

type ManagementKey = "weread_ignoredBooks" | "weread_customBooksISBN";
type SaveStatus = "success" | "conflict" | "invalid" | "read_failed" | "save_failed" | "uncertain" | "busy";
export interface WereadManagementSnapshot {
    exists: boolean;
    records: any[];
    fingerprint: string;
    canonical: boolean;
}
export interface WereadManagementSaveResult {
    status: SaveStatus;
    requiresReopen?: boolean;
}
function fail(status: SaveStatus): never { throw Object.assign(new Error("WEREAD_MANAGEMENT_" + status.toUpperCase()), { status }); }

async function normalize(plugin: any, key: ManagementKey, value: unknown): Promise<any[]> {
    if (key === "weread_customBooksISBN") {
        try {
            value = await loadCustomISBNBooksWithMigration({ name: plugin.name, i18n: plugin.i18n,
                loadDataStrict: async () => ({ exists: true, value }) }, { migrate: false });
        } catch { fail("invalid"); }
    }
    validateWereadManagementRecords(value);
    return structuredClone(value);
}

/** Missing is allowed, but its snapshot remains distinct from an existing empty array. */
export async function readWereadManagementSnapshot(plugin: any, key: ManagementKey, expected?: unknown): Promise<WereadManagementSnapshot> {
    let state;
    try { state = await loadPluginStorageJsonStateStrict(plugin, key); }
    catch (error) {
        fail(/插件存储 JSON 格式无效|插件存储文件内容为空/.test(error?.message || "")
            || ["STORAGE_JSON_INVALID", "STORAGE_EMPTY_BODY"].includes(error?.diagnosticCode) ? "invalid" : "read_failed");
    }
    const records = state.exists ? await normalize(plugin, key, state.value) : [];
    if (expected !== undefined && fingerprint(records) !== fingerprint(await normalize(plugin, key, expected))) fail("conflict");
    return { exists: state.exists, records, fingerprint: fingerprint({ exists: state.exists, records }),
        canonical: state.exists && fingerprint(state.value) === fingerprint(records) };
}

/** Management saves share this process-local lock with sync storage writers. */
export async function saveWereadManagementData(plugin: any, key: ManagementKey, initial: WereadManagementSnapshot, value: unknown, canWrite = () => true): Promise<WereadManagementSaveResult> {
    const release = tryAcquireWereadStorageWrite(plugin, key);
    if (!release) return { status: "busy" };
    let attempted = false;
    try {
        const records = await normalize(plugin, key, value);
        const current = await readWereadManagementSnapshot(plugin, key);
        if (!initial || current.fingerprint !== initial.fingerprint || !canWrite()) return { status: "conflict", requiresReopen: true };
        if (current.canonical && fingerprint(current.records) === fingerprint(records)) return { status: "success" };
        const guardedPlugin = { name: plugin.name, i18n: plugin.i18n,
            loadDataStrict: (storage: string) => loadPluginStorageJsonStateStrict(plugin, storage),
            saveData: async (storage: string, data: unknown) => { if (!canWrite()) fail("conflict"); attempted = true; await plugin.saveData(storage, data); } };
        try {
            if (key === "weread_customBooksISBN") await replaceCustomISBNBooks(guardedPlugin, records);
            else await guardedPlugin.saveData(key, records);
        } catch {
            // Migration or a rejected request may already have changed storage; never resubmit blindly.
            return { status: attempted && key === "weread_customBooksISBN" ? "uncertain" : "save_failed", requiresReopen: attempted };
        }
        try {
            const verified = await readWereadManagementSnapshot(plugin, key);
            if (!verified.exists || !verified.canonical || fingerprint(verified.records) !== fingerprint(records)) return { status: "uncertain", requiresReopen: true };
        } catch { return { status: "uncertain", requiresReopen: true }; }
        return { status: "success" };
    } catch (error) {
        const status: SaveStatus = ["invalid", "read_failed", "conflict"].includes(error?.status) ? error.status : "read_failed";
        return { status, requiresReopen: status !== "read_failed" };
    } finally { release(); }
}

export function wereadManagementSaveMessage(plugin: any, status: string): string {
    if (status === "conflict" || status === "busy") return t(plugin, "wereadManagementChanged", "管理数据已变化或正在保存，请关闭并重新打开管理窗口检查。");
    if (status === "invalid") return t(plugin, "wereadManagementInvalid", "管理记录格式异常，已拒绝覆盖；请检查后重新打开管理窗口。");
    if (status === "uncertain") return t(plugin, "wereadManagementUncertain", "保存结果暂时无法验证；请重新打开管理窗口检查实际状态，勿重复提交。");
    if (status === "save_failed") return t(plugin, "wereadManagementSaveFailed", "保存失败，未确认成功；请先检查实际状态，再重新打开管理窗口。");
    return t(plugin, "wereadManagementLoadFailed", "无法加载微信读书管理数据，请检查存储后重试。");
}
