/**
 * 获取微信读书存储记录的唯一键
 * 统一只使用 bookID 作为主键，和数据库层/同步层口径一致
 * 
 * 过渡方案：
 * - 读取旧数据时：若记录没有 bookID，仍兼容使用 syncID（历史旧数据）
 * - 新写入/去重合并/回写：一律只基于 bookID，不再保留 syncID
 */
function getWereadStorageKey(record: any): string {
    // 新逻辑主键：统一只认 bookID
    if (record?.bookID) return record.bookID.toString();
    // 读取兼容兜底：历史旧记录可能只有 syncID 没有 bookID
    if (record?.syncID) return record.syncID.toString();
    return "";
}

/**
 * 规范化存储记录，确保只保留 bookID 作为主键
 * 用于保存前清理历史遗留的 syncID，避免口径差异
 */
function normalizeStorageRecord(record: any): any {
    if (!record) return record;
    // 只保留必要字段，移除 syncID 避免后续混淆
    const { syncID, ...rest } = record;
    return rest;
}

export async function saveIgnoredBooks(plugin: any, newIgnoredBooks: any[]) {
    const existingIgnored = await plugin.loadData('weread_ignoredBooks') || [];
    const merged = [...existingIgnored, ...newIgnoredBooks];
    const uniqueMap = new Map();
    merged.forEach(book => {
        const key = getWereadStorageKey(book);
        if (key) {
            uniqueMap.set(key, book);
        }
    });

    // 回写时统一清理 syncID，只保留 bookID 作为主键
    const finalIgnoredBooks = Array.from(uniqueMap.values()).map(normalizeStorageRecord);

    await plugin.saveData('weread_ignoredBooks', finalIgnoredBooks);
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