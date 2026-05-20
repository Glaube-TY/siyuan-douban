import { DEFAULT_WEREAD_API_MODE_STATE } from "../../core/configDefaults";

interface WereadPluginLike {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
}

export async function ensureWereadApiModeState(plugin: WereadPluginLike): Promise<void> {
    const existing = await plugin.loadData("weread_api_mode_state");

    const source = existing && typeof existing === "object" ? existing : {};

    const state = {
        ...DEFAULT_WEREAD_API_MODE_STATE,
        ...source,
        enabledAt: source.enabledAt || Date.now(),
        ordinaryBookSyncEnabled: true,
        mpSyncEnabled: true,
    };

    await plugin.saveData("weread_api_mode_state", state);
}
