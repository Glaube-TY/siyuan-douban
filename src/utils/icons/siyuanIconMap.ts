export type SiYuanIconName =
    | "search"
    | "settings"
    | "info"
    | "inbox"
    | "sync"
    | "database"
    | "book"
    | "note"
    | "file"
    | "files"
    | "calendar"
    | "review"
    | "topic"
    | "stats"
    | "diagnostics"
    | "add"
    | "open"
    | "edit"
    | "download"
    | "template"
    | "localShelf"
    | "weread"
    | "apiKey"
    | "refresh"
    | "warning"
    | "success"
    | "error"
    | "back"
    | "clock"
    | "plugin"
    | "douban"
    | "officialAccount"
    | "mp";

export const SIYUAN_ICON_MAP: Record<SiYuanIconName, string> = {
    search: "iconSearch",
    settings: "iconSettings",
    info: "iconInfo",
    inbox: "iconInbox",
    sync: "iconRefresh",
    database: "iconDatabase",
    book: "iconBookmark",
    note: "iconMark",
    file: "iconFile",
    files: "iconFiles",
    calendar: "iconCalendar",
    review: "iconRiffCard",
    topic: "iconTags",
    stats: "iconGraph",
    diagnostics: "iconBug",
    add: "iconAdd",
    open: "iconOpen",
    edit: "iconEdit",
    download: "iconDownload",
    template: "iconFile",
    localShelf: "iconBookmark",
    weread: "weread",
    apiKey: "iconKey",
    refresh: "iconRefresh",
    warning: "iconInfo",
    success: "iconCheck",
    error: "iconCloseRound",
    back: "iconBack",
    clock: "iconClock",
    plugin: "iconPlugin",
    douban: "iconSearch",
    officialAccount: "iconBookmark",
    mp: "iconBookmark",
};

export const SIYUAN_IMAGE_ICON_MAP: Record<string, string> = {
    weread: "WeRead.png",
    douban: "豆瓣.png",
    officialAccount: "公众号.png",
    mp: "公众号.png",
};

const KNOWN_SIYUAN_ICON_SET: ReadonlySet<string> = new Set(Object.values(SIYUAN_ICON_MAP));

export function resolveSiYuanIconName(name?: string): string {
    const raw = String(name || "").trim();
    if (!raw) return SIYUAN_ICON_MAP.plugin;
    const mapped = SIYUAN_ICON_MAP[raw as SiYuanIconName];
    if (mapped) return mapped;
    if (KNOWN_SIYUAN_ICON_SET.has(raw)) return raw;
    return SIYUAN_ICON_MAP.plugin;
}

export function isImageIconName(name?: string): boolean {
    const raw = String(name || "").trim();
    return raw in SIYUAN_IMAGE_ICON_MAP;
}

export function resolveImageIconSrc(name: string, pluginName: string): string {
    const fileName = SIYUAN_IMAGE_ICON_MAP[name];
    if (!fileName || !pluginName) return "";
    return `/plugins/${pluginName}/asset/${encodeURIComponent(fileName)}`;
}

export function isWereadIconName(name?: string): boolean {
    return resolveSiYuanIconName(name) === "weread";
}
