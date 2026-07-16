import { sql } from "../../api";
import { DEFAULT_SETTINGS, loadPluginData } from "../core/configDefaults";
import type { WorkbenchDatabaseStatus } from "../../types/workbench";
import { t } from "../i18n";

type PluginLike = {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
    i18n?: Record<string, unknown>;
};

function escapeSqlText(value: string): string {
    return value.replace(/"/g, '""');
}

export async function validateDatabaseBlock(blockID: string, i18nSource?: Record<string, unknown> | null): Promise<WorkbenchDatabaseStatus> {
    const trimmed = String(blockID || "").trim();
    if (!trimmed) {
        return {
            configured: false,
            valid: false,
            blockID: "",
            avID: "",
            message: t(i18nSource, "databaseNotConfigured", "未配置本地书籍数据库"),
        };
    }

    try {
        const result = await sql(`SELECT * FROM blocks WHERE id = "${escapeSqlText(trimmed)}"`);
        const markdown = result?.[0]?.markdown || "";
        const avDivMatch = String(markdown).match(/data-av-id="([^"]+)"/);
        if (!result?.length || !markdown) {
            throw new Error(t(i18nSource, "databaseBlockNotFound", "未找到数据库块"));
        }
        if (!avDivMatch?.[1]) {
            throw new Error(t(i18nSource, "databaseNotAttributeView", "该块不是有效的属性视图数据库"));
        }

        return {
            configured: true,
            valid: true,
            blockID: trimmed,
            avID: avDivMatch[1],
            message: t(i18nSource, "databaseConnected", "本地书籍数据库已连接"),
        };
    } catch (error: any) {
        return {
            configured: true,
            valid: false,
            blockID: trimmed,
            avID: "",
            message: error?.message || t(i18nSource, "databaseValidationFailed", "数据库校验失败"),
        };
    }
}

export async function loadDatabaseSettings(plugin: PluginLike): Promise<WorkbenchDatabaseStatus> {
    const settings = await loadPluginData(plugin, "settings.json", DEFAULT_SETTINGS);
    return validateDatabaseBlock(settings.bookDatabaseID || "", plugin);
}

export async function saveDatabaseSettings(plugin: PluginLike, blockID: string): Promise<WorkbenchDatabaseStatus> {
    const current = await loadPluginData(plugin, "settings.json", DEFAULT_SETTINGS);
    const status = await validateDatabaseBlock(blockID, plugin);
    await plugin.saveData("settings.json", {
        ...current,
        bookDatabaseID: status.valid ? status.blockID : String(blockID || "").trim(),
    });
    return status;
}
