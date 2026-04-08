export async function saveIgnoredBooks(plugin: any, newIgnoredBooks: any[]) {
    const existingIgnored = await plugin.loadData('weread_ignoredBooks') || [];
    const merged = [...existingIgnored, ...newIgnoredBooks];
    const uniqueMap = new Map();
    merged.forEach(book => {
        const bookID = book.bookID?.toString();
        if (bookID) {
            uniqueMap.set(bookID, book);
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
        const customMap = new Map(merged.map(item => [item.bookID, item]));
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
        const bookID = book.bookID?.toString();
        if (bookID) {
            useBookIDMap.set(bookID, book);
        }
    });

    const finalUseBookIDBooks = Array.from(useBookIDMap.values());

    await plugin.saveData("weread_useBookIDBooks", finalUseBookIDBooks);
}