import {
    DEFAULT_WEREAD_AUTH_SETTINGS,
    DEFAULT_WEREAD_SETTINGS,
    loadPluginData,
} from "../core/configDefaults";
import { maskWereadApiKey, validateWereadApiKey } from "../weread/api/wereadApiAuth";
import { WEREAD_API_PROTOCOL_VERSION } from "../weread/api/constants";
import {
    encryptWereadApiKey,
    decryptWereadApiKey,
    isEncryptedWereadApiKey,
} from "./wereadApiKeyCrypto";

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

    let apiKey = "";

    if (isEncryptedWereadApiKey(auth.apiKeyEncrypted)) {
        try {
            apiKey = decryptWereadApiKey(auth.apiKeyEncrypted);
        } catch {
            return {
                apiKey: "",
                maskedApiKey: "",
                verified: false,
                verifiedAt: auth.verifiedAt || 0,
                lastError: "API Key 解密失败，请重新验证",
            };
        }
        // 兜底：解密成功但旧明文仍残留时，清空明文
        if (auth.apiKey) {
            try {
                await plugin.saveData("weread_auth_settings", {
                    ...auth,
                    apiKey: "",
                });
            } catch {
                // 清理失败不影响运行时
            }
        }
    } else if (auth.apiKey) {
        // 旧用户明文迁移：首次读取时自动加密保存
        apiKey = auth.apiKey;
        try {
            await plugin.saveData("weread_auth_settings", {
                provider: auth.provider || "apiKey",
                apiKey: "",
                apiKeyEncrypted: encryptWereadApiKey(apiKey),
                apiKeyCryptoVersion: 1,
                verified: auth.verified,
                verifiedAt: auth.verifiedAt || 0,
                apiProtocolVersion: auth.apiProtocolVersion || WEREAD_API_PROTOCOL_VERSION,
                lastError: auth.lastError || "",
            });
        } catch {
            // 迁移保存失败不影响本次运行时使用
        }
    }

    return {
        apiKey,
        maskedApiKey: maskWereadApiKey(apiKey),
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
        apiKey: "",
        apiKeyEncrypted: trimmed ? encryptWereadApiKey(trimmed) : "",
        apiKeyCryptoVersion: 1,
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
        apiKeyEncrypted: "",
        apiKeyCryptoVersion: 1,
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
