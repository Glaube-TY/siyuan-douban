import { sql } from "../../api";
import { DEFAULT_SETTINGS, loadPluginData } from "../core/configDefaults";
import type { WorkbenchDatabaseStatus } from "../../types/workbench";

type PluginLike = {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
};

function escapeSqlText(value: string): string {
    return value.replace(/"/g, '""');
}

export async function validateDatabaseBlock(blockID: string): Promise<WorkbenchDatabaseStatus> {
    const trimmed = String(blockID || "").trim();
    if (!trimmed) {
        return {
            configured: false,
            valid: false,
            blockID: "",
            avID: "",
            message: "未配置本地书籍数据库",
        };
    }

    try {
        const result = await sql(`SELECT * FROM blocks WHERE id = "${escapeSqlText(trimmed)}"`);
        const markdown = result?.[0]?.markdown || "";
        const avDivMatch = String(markdown).match(/data-av-id="([^"]+)"/);
        if (!result?.length || !markdown) {
            throw new Error("未找到数据库块");
        }
        if (!avDivMatch?.[1]) {
            throw new Error("该块不是有效的属性视图数据库");
        }

        return {
            configured: true,
            valid: true,
            blockID: trimmed,
            avID: avDivMatch[1],
            message: "本地书籍数据库已连接",
        };
    } catch (error: any) {
        return {
            configured: true,
            valid: false,
            blockID: trimmed,
            avID: "",
            message: error?.message || "数据库校验失败",
        };
    }
}

export async function loadDatabaseSettings(plugin: PluginLike): Promise<WorkbenchDatabaseStatus> {
    const settings = await loadPluginData(plugin, "settings.json", DEFAULT_SETTINGS);
    return validateDatabaseBlock(settings.bookDatabaseID || "");
}

export async function saveDatabaseSettings(plugin: PluginLike, blockID: string): Promise<WorkbenchDatabaseStatus> {
    const current = await loadPluginData(plugin, "settings.json", DEFAULT_SETTINGS);
    const status = await validateDatabaseBlock(blockID);
    await plugin.saveData("settings.json", {
        ...current,
        bookDatabaseID: status.valid ? status.blockID : String(blockID || "").trim(),
    });
    return status;
}
