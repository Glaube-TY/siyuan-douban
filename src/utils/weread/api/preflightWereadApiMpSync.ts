import { findWereadApiBookTargetDoc } from "./findWereadApiBookTargetDoc";

interface WereadPluginLike {
    loadData: (key: string) => Promise<any>;
    i18n: Record<string, string>;
}

export async function preflightWereadApiMpSync(plugin: WereadPluginLike): Promise<{
    total: number;
    checked: number;
    ready: number;
    failed: number;
    skippedNormalBook: number;
    items: Array<{
        bookID: string;
        title: string;
        sourceType: string;
        status: "ready" | "failed" | "skipped_normal_book";
        matchType?: "bookID" | "ISBN" | "title";
        blockID?: string;
        message: string;
    }>;
}> {
    const cache = await plugin.loadData("temporary_weread_notebooksList");

    if (!Array.isArray(cache) || cache.length === 0) {
        return {
            total: 0,
            checked: 0,
            ready: 0,
            failed: 1,
            skippedNormalBook: 0,
            items: [{
                bookID: "",
                title: "",
                sourceType: "",
                status: "failed",
                message: "请先拉取有笔记书籍缓存",
            }],
        };
    }

    const items: Array<{
        bookID: string;
        title: string;
        sourceType: string;
        status: "ready" | "failed" | "skipped_normal_book";
        matchType?: "bookID" | "ISBN" | "title";
        blockID?: string;
        message: string;
    }> = [];

    let ready = 0;
    let failed = 0;
    let skippedNormalBook = 0;

    for (const book of cache) {
        const bookID = book?.bookID || book?.bookId || "";
        const title = book?.title || "";
        const sourceType = book?.sourceType || "";

        if (!bookID) {
            continue;
        }

        if (sourceType !== "weread_mp_account") {
            skippedNormalBook++;
            items.push({
                bookID,
                title,
                sourceType,
                status: "skipped_normal_book",
                message: "普通书跳过",
            });
            continue;
        }

        const result = await findWereadApiBookTargetDoc(
            plugin,
            { bookID, title, isbn: "" },
            { cleanupOrphans: false }
        );

        if (result.success) {
            ready++;
            items.push({
                bookID,
                title,
                sourceType,
                status: "ready",
                matchType: result.matchType,
                blockID: result.blockID,
                message: result.message,
            });
        } else {
            failed++;
            items.push({
                bookID,
                title,
                sourceType,
                status: "failed",
                message: result.message,
            });
        }
    }

    return {
        total: cache.length,
        checked: items.length,
        ready,
        failed,
        skippedNormalBook,
        items,
    };
}
