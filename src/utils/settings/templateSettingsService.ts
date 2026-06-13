import {
    DEFAULT_SETTINGS,
    DEFAULT_WEREAD_POSITION_MARK,
    loadPluginData,
    normalizeWereadPositionMark,
} from "../core/configDefaults";

type PluginLike = {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
};

export interface TemplateSettings {
    addNotes: boolean;
    isSYTemplateRender: boolean;
    noteTemplate: string;
    wereadTemplates: string;
    wereadMpTemplates: string;
    wereadPositionMark: string;
}

export async function loadTemplateSettings(plugin: PluginLike): Promise<TemplateSettings> {
    const settings = await loadPluginData(plugin, "settings.json", DEFAULT_SETTINGS);
    const wereadPositionMark = normalizeWereadPositionMark(await plugin.loadData("weread_position_mark"));
    return {
        addNotes: settings.addNotes ?? true,
        isSYTemplateRender: settings.isSYTemplateRender ?? false,
        noteTemplate: settings.noteTemplate || "",
        wereadTemplates: await plugin.loadData("weread_templates") || "",
        wereadMpTemplates: await plugin.loadData("weread_mp_templates") || "",
        wereadPositionMark: wereadPositionMark || DEFAULT_WEREAD_POSITION_MARK,
    };
}

export async function saveTemplateSettings(plugin: PluginLike, next: TemplateSettings): Promise<TemplateSettings> {
    const current = await loadPluginData(plugin, "settings.json", DEFAULT_SETTINGS);
    const normalizedPositionMark = normalizeWereadPositionMark(next.wereadPositionMark);
    await plugin.saveData("settings.json", {
        ...current,
        addNotes: next.addNotes,
        isSYTemplateRender: next.isSYTemplateRender,
        noteTemplate: next.noteTemplate || "",
    });
    await plugin.saveData("weread_templates", next.wereadTemplates || "");
    await plugin.saveData("weread_mp_templates", next.wereadMpTemplates || "");
    await plugin.saveData("weread_position_mark", normalizedPositionMark);

    return {
        ...next,
        noteTemplate: next.noteTemplate || "",
        wereadTemplates: next.wereadTemplates || "",
        wereadMpTemplates: next.wereadMpTemplates || "",
        wereadPositionMark: normalizedPositionMark,
    };
}
