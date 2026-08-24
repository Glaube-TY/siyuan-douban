/**
 * 获取微信读书存储记录的唯一键
 * 统一只使用 bookID 作为主键，和数据库层/同步层口径一致
 * 
 * 过渡方案：
 * - 读取旧数据时：若记录没有 bookID，仍兼容使用 syncID（历史旧数据）
 * - 新写入/去重合并/回写：一律只基于 bookID，不再保留 syncID
 */
export function getWereadStorageKey(record: any): string {
    for (const value of [record?.bookID, record?.bookId, record?.syncID]) {
        const key = String(value ?? "").trim();
        if (key) return key;
    }
    return "";
}

/**
 * 规范化存储记录，确保只保留 bookID 作为主键
 * 用于保存前清理历史遗留的 syncID，避免口径差异
 */
function normalizeStorageRecord(record: any): any {
    if (!record || typeof record !== "object") return record;
    const bookID = getWereadStorageKey(record);
    const { syncID, bookId, ...rest } = record;
    return bookID ? { ...rest, bookID } : rest;
}

function normalizeIgnoredBooks(records: any[]): any[] {
    const uniqueMap = new Map<string, any>();
    for (const record of Array.isArray(records) ? records : []) {
        const key = getWereadStorageKey(record);
        if (!key) continue;
        uniqueMap.set(key, normalizeStorageRecord(record));
    }
    return Array.from(uniqueMap.values());
}

export async function loadIgnoredBooks(plugin: any): Promise<any[]> {
    const records = await plugin.loadData("weread_ignoredBooks");
    return Array.isArray(records) ? records : [];
}

export function getIgnoredBookIDSet(ignoredBooks: any[] | null | undefined): Set<string> {
    const bookIDs = new Set<string>();
    for (const record of Array.isArray(ignoredBooks) ? ignoredBooks : []) {
        const bookID = getWereadStorageKey(record);
        if (bookID) bookIDs.add(bookID);
    }
    return bookIDs;
}

export async function replaceIgnoredBooks(plugin: any, records: any[]): Promise<void> {
    await plugin.saveData("weread_ignoredBooks", normalizeIgnoredBooks(records));
}

export async function saveIgnoredBooks(plugin: any, newIgnoredBooks: any[]) {
    const existingIgnored = await loadIgnoredBooks(plugin);
    await replaceIgnoredBooks(plugin, [...existingIgnored, ...(Array.isArray(newIgnoredBooks) ? newIgnoredBooks : [])]);
}

// 保存自定义书籍ISBN
export async function saveCustomBooksISBN(plugin: any, selectedBooks: any[], cloudNotebooksList: any[]) {
    const customBooks = selectedBooks
        .filter(book => {
            const originalBook = cloudNotebooksList.find(original => original.bookID === book.bookID);
            const shouldSave = originalBook && originalBook.isbn === "" && book.isbn !== "";
            return shouldSave;
        })
        .map(({ title, isbn, bookID }) => ({
            title,
            customISBN: isbn,
            bookID: bookID,
        }));

    if (customBooks.length > 0) {
        const existingCustom = await plugin.loadData("weread_customBooksISBN") || [];

        const merged = [...existingCustom, ...customBooks];
        const customMap = new Map();
        merged.forEach(item => {
            const key = getWereadStorageKey(item);
            if (key) {
                customMap.set(key, item);
            }
        });
        // 回写时统一清理 syncID，只保留 bookID 作为主键
        const finalCustomBooks = Array.from(customMap.values()).map(normalizeStorageRecord);

        await plugin.saveData("weread_customBooksISBN", finalCustomBooks);
    }
}

// 保存使用bookID同步的书籍信息
export async function saveUseBookIDBooks(plugin: any, useBookIDBooks: any[]) {
    const existingUseBookID = await plugin.loadData("weread_useBookIDBooks") || [];

    const merged = [...existingUseBookID, ...useBookIDBooks];
    const useBookIDMap = new Map();
    merged.forEach(book => {
        const key = getWereadStorageKey(book);
        if (key) {
            useBookIDMap.set(key, book);
        }
    });

    // 回写时统一清理 syncID，只保留 bookID 作为主键
    const finalUseBookIDBooks = Array.from(useBookIDMap.values()).map(normalizeStorageRecord);

    await plugin.saveData("weread_useBookIDBooks", finalUseBookIDBooks);
}
