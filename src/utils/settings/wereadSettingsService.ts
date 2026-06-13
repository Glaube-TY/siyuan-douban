import {
    DEFAULT_WEREAD_AUTH_SETTINGS,
    DEFAULT_WEREAD_SETTINGS,
    loadPluginData,
} from "../core/configDefaults";
import { maskWereadApiKey, validateWereadApiKey } from "../weread/api/wereadApiAuth";
import { WEREAD_API_PROTOCOL_VERSION } from "../weread/api/constants";

type PluginLike = {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
};

export interface WereadAuthState {
    apiKey: string;
    maskedApiKey: string;
    verified: boolean;
    verifiedAt: number;
    lastError: string;
}

export interface WereadSyncOptions {
    autoSync: boolean;
    skipNewBookCheck: boolean;
}

export async function loadWereadAuthState(plugin: PluginLike): Promise<WereadAuthState> {
    const auth = await loadPluginData(plugin, "weread_auth_settings", DEFAULT_WEREAD_AUTH_SETTINGS);
    return {
        apiKey: auth.apiKey || "",
        maskedApiKey: maskWereadApiKey(auth.apiKey || ""),
        verified: !!auth.verified,
        verifiedAt: auth.verifiedAt || 0,
        lastError: auth.lastError || "",
    };
}

export async function verifyAndSaveWereadApiKey(plugin: PluginLike, apiKey: string): Promise<WereadAuthState> {
    const trimmed = String(apiKey || "").trim();
    const result = await validateWereadApiKey(trimmed);
    const next = {
        provider: "apiKey",
        apiKey: trimmed,
        verified: !!result.success,
        verifiedAt: result.success ? result.verifiedAt || Date.now() : 0,
        apiProtocolVersion: WEREAD_API_PROTOCOL_VERSION,
        lastError: result.success ? "" : result.message,
    };
    await plugin.saveData("weread_auth_settings", next);
    return {
        apiKey: trimmed,
        maskedApiKey: maskWereadApiKey(trimmed),
        verified: next.verified,
        verifiedAt: next.verifiedAt,
        lastError: next.lastError,
    };
}

export async function clearWereadApiKey(plugin: PluginLike): Promise<WereadAuthState> {
    await plugin.saveData("weread_auth_settings", {
        provider: "apiKey",
        apiKey: "",
        verified: false,
        verifiedAt: 0,
        apiProtocolVersion: WEREAD_API_PROTOCOL_VERSION,
        lastError: "",
    });
    await plugin.saveData("temporary_weread_notebooksList", null);
    await plugin.saveData("weread_notebooksList_readyAt", null);
    await plugin.saveData("weread_reading_stats_cache", null);
    return loadWereadAuthState(plugin);
}

export async function loadWereadSyncOptions(plugin: PluginLike): Promise<WereadSyncOptions> {
    const settings = await loadPluginData(plugin, "weread_settings", DEFAULT_WEREAD_SETTINGS);
    return {
        autoSync: !!settings.autoSync,
        skipNewBookCheck: !!settings.skipNewBookCheck,
    };
}

export async function saveWereadSyncOptions(plugin: PluginLike, next: WereadSyncOptions): Promise<WereadSyncOptions> {
    const current = await loadPluginData(plugin, "weread_settings", DEFAULT_WEREAD_SETTINGS);
    const normalized = {
        autoSync: !!next.autoSync,
        skipNewBookCheck: !!next.skipNewBookCheck,
    };
    await plugin.saveData("weread_settings", {
        ...current,
        ...normalized,
    });
    return normalized;
}
