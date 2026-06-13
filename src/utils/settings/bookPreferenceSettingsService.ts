import { DEFAULT_SETTINGS, loadPluginData } from "../core/configDefaults";

type PluginLike = {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
};

export interface BookPreferenceSettings {
    ratings: string[];
    categories: string[];
    statuses: string[];
}

function normalizeList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }
    return String(value || "")
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
}

export async function loadBookPreferenceSettings(plugin: PluginLike): Promise<BookPreferenceSettings> {
    const settings = await loadPluginData(plugin, "settings.json", DEFAULT_SETTINGS);
    return {
        ratings: normalizeList(settings.ratings),
        categories: normalizeList(settings.categories),
        statuses: normalizeList(settings.statuses),
    };
}

export async function saveBookPreferenceSettings(plugin: PluginLike, next: BookPreferenceSettings): Promise<BookPreferenceSettings> {
    const current = await loadPluginData(plugin, "settings.json", DEFAULT_SETTINGS);
    const normalized = {
        ratings: normalizeList(next.ratings),
        categories: normalizeList(next.categories),
        statuses: normalizeList(next.statuses),
    };
    await plugin.saveData("settings.json", {
        ...current,
        ...normalized,
    });
    return normalized;
}
