import type { WereadCookieData, PluginSettings } from "../weread/types";

interface PluginDataLoader {
    loadData: (key: string) => Promise<any>;
}

export const DEFAULT_WEREAD_SETTINGS = {
    autoSync: false,
};

export const DEFAULT_WEREAD_COOKIE: WereadCookieData = {
    cookies: "",
    isQRCode: false,
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