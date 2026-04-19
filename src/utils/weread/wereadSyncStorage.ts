/**
 * 获取微信读书存储记录的唯一键
 * 优先使用 syncID，其次 bookID，都没有返回空字符串
 */
function getWereadStorageKey(record: any): string {
    if (record?.syncID) return record.syncID.toString();
    if (record?.bookID) return record.bookID.toString();
    return "";
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

    const finalIgnoredBooks = Array.from(uniqueMap.values());

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
        const finalCustomBooks = Array.from(customMap.values());

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

    const finalUseBookIDBooks = Array.from(useBookIDMap.values());

    await plugin.saveData("weread_useBookIDBooks", finalUseBookIDBooks);
}