import type { PluginSettings } from "../weread/types";
import type { WereadAuthSettings } from "../weread/api/types";
import { WEREAD_API_PROTOCOL_VERSION } from "../weread/api/constants";

interface PluginDataLoader {
    loadData: (key: string) => Promise<any>;
}

export const DEFAULT_WEREAD_SETTINGS = {
    autoSync: false,
    skipNewBookCheck: false,
};

export const DEFAULT_WEREAD_POSITION_MARK = "【微信读书同步笔记】";

export function normalizeWereadPositionMark(mark: any): string {
    const normalized = String(mark ?? "").trim();
    return normalized || DEFAULT_WEREAD_POSITION_MARK;
}

export const DEFAULT_WEREAD_AUTH_SETTINGS: WereadAuthSettings = {
    provider: "apiKey",
    apiKey: "",
    verified: false,
    verifiedAt: 0,
    apiProtocolVersion: WEREAD_API_PROTOCOL_VERSION,
    lastError: "",
    apiKeyEncrypted: "",
    apiKeyCryptoVersion: 1,
};

export const WEREAD_API_MODE_STATE_SCHEMA = 1;

export const DEFAULT_WEREAD_API_MODE_STATE = {
    schema: 1,
    provider: "apiKey",
    enabledAt: 0,
    ordinaryBookSyncEnabled: true,
    mpSyncEnabled: true,
};

export const DEFAULT_SETTINGS: PluginSettings = {
    ratings: [],
    categories: [],
    statuses: [],
    addNotes: true,
    isSYTemplateRender: false,
    bookDatabaseID: "",
    noteTemplate: "",
};

export async function loadPluginData<T extends object>(plugin: PluginDataLoader, key: string, defaults: T): Promise<T> {
    const data = await plugin.loadData(key);
    if (data === null || data === undefined || typeof data !== 'object') {
        return defaults;
    }
    return { ...defaults, ...data };
}