<script lang="ts">
    import { I18N } from "siyuan";

    interface BookItem {
        sourceType?: string;
        title: string;
        isbn: string;
        bookID: string;
        author?: string;
        cover?: string;
        introduction?: string;
        noteCount?: number;
        reviewCount?: number;
    }

    export let i18n: I18N;

    export let books: BookItem[];
    export let onConfirm: (
        selectedBooks: BookItem[],
        ignoredBooks: BookItem[],
        useBookIDBooks: BookItem[],
    ) => void | Promise<void>;
    export let onContinue: (
        ignoredBooks: BookItem[],
    ) => void | Promise<void>;
    export let onCancel: () => void;

    let originalISBNs = new Map(books.map((book) => [book.bookID, book.isbn ?? ""]));
    let selectedBooks: BookItem[] = [];
    let ignoredBooks: BookItem[] = [];
    let useBookIDs: BookItem[] = [];

    // 处理中状态，防止重复点击
    let isProcessing = false;

    // 归一化 ISBN 避免 UI 异常
    books.forEach((book) => {
        if (book.isbn === undefined || book.isbn === null) {
            book.isbn = "";
        }
    });

    // 分成两组
    $: normalBooks = books.filter(b => b.sourceType !== "weread_mp_account");
    $: mpAccounts = books.filter(b => b.sourceType === "weread_mp_account");

    const isValidISBN = (isbn: string) => {
        const cleaned = isbn.replace(/[-\s]/g, "");
        return cleaned.length === 13 || cleaned.length === 10;
    };

    // 普通书可选项：ISBN有效 且 未忽略 且 未使用BookID
    $: selectableNormalBooks = normalBooks.filter(
        b => isValidISBN(b.isbn) &&
             !ignoredBooks.some(ib => ib.bookID === b.bookID) &&
             !useBookIDs.some(ub => ub.bookID === b.bookID)
    );

    // 公众号可选项：未忽略
    $: selectableMpAccounts = mpAccounts.filter(
        b => !ignoredBooks.some(ib => ib.bookID === b.bookID)
    );

    $: allNormalSelected =
        selectableNormalBooks.length > 0 &&
        selectableNormalBooks.every((book) => selectedBooks.some((b) => b.bookID === book.bookID));

    $: allMpSelected =
        selectableMpAccounts.length > 0 &&
        selectableMpAccounts.every((book) => selectedBooks.some((b) => b.bookID === book.bookID));

    // 是否有有效确认选择（选中书籍或useBookID）
    $: hasConfirmSelection = selectedBooks.length > 0 || useBookIDs.length > 0;

    function toggleAllNormalBooks() {
        if (allNormalSelected) {
            // 取消所有当前可选普通书的选择，保留公众号选择
            selectedBooks = selectedBooks.filter(b => b.sourceType === "weread_mp_account" || !selectableNormalBooks.some(sb => sb.bookID === b.bookID));
        } else {
            // 只添加当前可选但未选的普通书
            const toAdd = selectableNormalBooks.filter(b => !selectedBooks.some(sb => sb.bookID === b.bookID));
            selectedBooks = [...selectedBooks, ...toAdd];
        }
    }

    function toggleAllMpAccounts() {
        if (allMpSelected) {
            // 取消所有当前可选公众号的选择，保留普通书选择
            selectedBooks = selectedBooks.filter(b => b.sourceType !== "weread_mp_account" || !selectableMpAccounts.some(sb => sb.bookID === b.bookID));
        } else {
            // 只添加当前可选但未选的公众号
            const toAdd = selectableMpAccounts.filter(b => !selectedBooks.some(sb => sb.bookID === b.bookID));
            selectedBooks = [...selectedBooks, ...toAdd];
        }
    }

    function toggleBook(book: BookItem) {
        const isMp = book.sourceType === "weread_mp_account";
        const index = selectedBooks.findIndex((b) => b.bookID === book.bookID);
        if (index > -1) {
            selectedBooks.splice(index, 1);
        } else {
            selectedBooks.push(book);
            // 选择时，从其他列表中移除
            const ignoreIndex = ignoredBooks.findIndex((b) => b.bookID === book.bookID);
            if (ignoreIndex > -1) {
                ignoredBooks.splice(ignoreIndex, 1);
            }
            // 公众号账号不使用BookID
            if (!isMp) {
                const useBookIDIndex = useBookIDs.findIndex((b) => b.bookID === book.bookID);
                if (useBookIDIndex > -1) {
                    useBookIDs.splice(useBookIDIndex, 1);
                }
            }
        }
        selectedBooks = [...selectedBooks];
        ignoredBooks = [...ignoredBooks];
        useBookIDs = [...useBookIDs];
    }

    function toggleIgnore(book: BookItem) {
        const isMp = book.sourceType === "weread_mp_account";
        const index = ignoredBooks.findIndex((b) => b.bookID === book.bookID);
        if (index > -1) {
            ignoredBooks.splice(index, 1);
        } else {
            ignoredBooks.push(book);
            // 忽略时，从其他列表中移除
            const selectedIndex = selectedBooks.findIndex((b) => b.bookID === book.bookID);
            if (selectedIndex > -1) {
                selectedBooks.splice(selectedIndex, 1);
            }
            if (!isMp) {
                const useBookIDIndex = useBookIDs.findIndex((b) => b.bookID === book.bookID);
                if (useBookIDIndex > -1) {
                    useBookIDs.splice(useBookIDIndex, 1);
                }
            }
        }
        selectedBooks = [...selectedBooks];
        ignoredBooks = [...ignoredBooks];
        useBookIDs = [...useBookIDs];
    }

    function toggleUseBookID(book: BookItem) {
        // 公众号账号不使用BookID
        if (book.sourceType === "weread_mp_account") return;
        const index = useBookIDs.findIndex((b) => b.bookID === book.bookID);
        if (index > -1) {
            useBookIDs.splice(index, 1);
        } else {
            useBookIDs.push(book);
            const selectedIndex = selectedBooks.findIndex((b) => b.bookID === book.bookID);
            if (selectedIndex > -1) {
                selectedBooks.splice(selectedIndex, 1);
            }
            const ignoreIndex = ignoredBooks.findIndex((b) => b.bookID === book.bookID);
            if (ignoreIndex > -1) {
                ignoredBooks.splice(ignoreIndex, 1);
            }
        }
        selectedBooks = [...selectedBooks];
        ignoredBooks = [...ignoredBooks];
        useBookIDs = [...useBookIDs];
    }

    // 处理确认选择按钮点击
    async function handleConfirm() {
        if (isProcessing) return;
        isProcessing = true;
        try {
            await onConfirm(selectedBooks, ignoredBooks, useBookIDs);
        } finally {
            isProcessing = false;
        }
    }

    // 处理继续同步按钮点击
    async function handleContinue() {
        if (isProcessing) return;
        isProcessing = true;
        try {
            await onContinue(ignoredBooks);
        } finally {
            isProcessing = false;
        }
    }

    // 处理取消同步按钮点击
    function handleCancel() {
        if (isProcessing) return;
        onCancel();
    }
</script>

<div class="notebooks-dialog">
    <div class="confirm-btn-container">
        <button
            class="confirm-btn"
            on:click={handleConfirm}
            disabled={!hasConfirmSelection || isProcessing}
            >{i18n.confirmSelect}</button
        >
        <button class="continue-btn" on:click={handleContinue}
            disabled={isProcessing}
            >{i18n.continueSync}</button
        >
        <button class="cancel-btn" on:click={handleCancel} disabled={isProcessing}>取消同步</button>
    </div>

    <!-- 新书籍表格 -->
    {#if normalBooks.length > 0}
    <div class="section-title">新书籍</div>
    <table class="book-table">
        <thead>
            <tr>
                <th>
                    <input
                        type="checkbox"
                        title={i18n.selectAll}
                        on:change={toggleAllNormalBooks}
                        checked={allNormalSelected}
                    />
                    {i18n.select}
                </th>
                <th class="book-title">{i18n.bookTitle1}</th>
                <th class="book-isbn">{i18n.bookIsbn1}</th>
                <th class="ignore-column" title="选择、忽略、使用BookID 三选一">{i18n.ignore}</th>
                <th class="use-bookid-column" title="选择、忽略、使用BookID 三选一">使用BookID</th>
            </tr>
        </thead>
        <tbody>
            {#each normalBooks as book}
                <tr class="book-row">
                    <td>
                        <input
                            type="checkbox"
                            on:change={() => toggleBook(book)}
                            checked={selectedBooks.some(
                                (b) => b.bookID === book.bookID,
                            )}
                            disabled={!isValidISBN(book.isbn) || 
                                     ignoredBooks.some((b) => b.bookID === book.bookID) || 
                                     useBookIDs.some((b) => b.bookID === book.bookID)}
                        />
                    </td>
                    <td>{book.title || book.bookID || "未命名书籍"}</td>
                    <td>
                        <input
                            type="text"
                            bind:value={book.isbn}
                            class="isbn-input"
                            disabled={originalISBNs.get(book.bookID) !== ""}
                            placeholder={originalISBNs.get(book.bookID)
                                ? i18n.bookIsbnExist
                                : book.isbn
                                  ? isValidISBN(book.isbn)
                                      ? i18n.bookIsbnValid
                                      : i18n.bookIsbnInvalid
                                  : i18n.bookIsbnManual}
                            class:invalid={!isValidISBN(book.isbn) &&
                                book.isbn !== ""}
                        />
                    </td>
                    <td class="ignore-checkbox" 
                        class:disabled={selectedBooks.some((b) => b.bookID === book.bookID) || 
                                       useBookIDs.some((b) => b.bookID === book.bookID)}>
                        <input
                            type="checkbox"
                            on:change={() => toggleIgnore(book)}
                            checked={ignoredBooks.some(
                                (b) => b.bookID === book.bookID,
                            )}
                            disabled={selectedBooks.some((b) => b.bookID === book.bookID) || 
                                     useBookIDs.some((b) => b.bookID === book.bookID)}
                        />
                    </td>
                    <td class="use-bookID" 
                        class:disabled={selectedBooks.some((b) => b.bookID === book.bookID) || 
                                       ignoredBooks.some((b) => b.bookID === book.bookID)}>
                        <input
                            type="checkbox"
                            on:change={() => toggleUseBookID(book)}
                            checked={useBookIDs.some(
                                (b) => b.bookID === book.bookID,
                            )}
                            disabled={selectedBooks.some((b) => b.bookID === book.bookID) || 
                                     ignoredBooks.some((b) => b.bookID === book.bookID)}
                        />
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>
    {/if}

    <!-- 新公众号表格 -->
    {#if mpAccounts.length > 0}
    <div class="section-title">新公众号</div>
    <table class="book-table">
        <thead>
            <tr>
                <th>
                    <input
                        type="checkbox"
                        title={i18n.selectAll}
                        on:change={toggleAllMpAccounts}
                        checked={allMpSelected}
                    />
                    {i18n.select}
                </th>
                <th class="book-title">公众号名称</th>
                <th class="book-intro">简介</th>
                <th class="note-count-column">笔记/评论</th>
                <th class="ignore-column">{i18n.ignore}</th>
            </tr>
        </thead>
        <tbody>
            {#each mpAccounts as book}
                <tr class="book-row">
                    <td>
                        <input
                            type="checkbox"
                            on:change={() => toggleBook(book)}
                            checked={selectedBooks.some(
                                (b) => b.bookID === book.bookID,
                            )}
                            disabled={ignoredBooks.some((b) => b.bookID === book.bookID)}
                        />
                    </td>
                    <td>{book.title || book.bookID || "未命名公众号"}</td>
                    <td class="intro-cell">{book.introduction || ""}</td>
                    <td class="note-count-cell">{book.noteCount ?? 0}/{book.reviewCount ?? 0}</td>
                    <td class="ignore-checkbox" 
                        class:disabled={selectedBooks.some((b) => b.bookID === book.bookID)}>
                        <input
                            type="checkbox"
                            on:change={() => toggleIgnore(book)}
                            checked={ignoredBooks.some(
                                (b) => b.bookID === book.bookID,
                            )}
                            disabled={selectedBooks.some((b) => b.bookID === book.bookID)}
                        />
                    </td>
                </tr>
            {/each}
        </tbody>
    </table>
    {/if}
</div>

<style lang="scss">
    .notebooks-dialog {
        padding: 10px;
        max-height: 80vh;
        overflow: auto;
        width: 100%;
        max-width: 90vw;

        .confirm-btn-container {
            display: flex;
            justify-content: center;
            gap: 10px;

            button {
                padding: 10px 20px;
                border-radius: 8px;
                border: 1px solid var(--b3-border-color);
            }

            .confirm-btn {
                &:hover {
                    background-color: var(--b3-theme-primary);
                    color: white;
                }
            }

            .cancel-btn {
                &:hover {
                    background-color: var(--b3-theme-error);
                    color: white;
                }
            }
        }

        .book-table {
            width: auto;
            border-collapse: collapse;
            margin: 10px 0;

            input[type="checkbox"]:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                filter: grayscale(50%);
            }

            th,
            td {
                padding: 4px 8px;
                border: 1px solid #eee;
                text-align: left;
            }

            th {
                background-color: var(--b3-theme-background-light);
                font-weight: bold;
            }

            .book-row:hover {
                background-color: #f8f8f8;
            }

            .isbn-input {
                width: 100%;
                padding: 2px 4px;
                border: none;
                background: transparent;
                &:focus {
                    outline: 1px solid var(--b3-theme-primary);
                }
                &:invalid {
                    outline: 1px solid var(--b3-theme-error);
                    background-color: #ffe6e6;
                }
            }

            .ignore-column {
                width: 60px;
            }
            .ignore-checkbox {
                text-align: center;
                input[type="checkbox"] {
                    margin: 0;
                    transform: scale(1.2);
                }
                &.disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
            }
            .use-bookid-column {
                width: 80px;
                text-align: center;
            }
            .use-bookID {
                text-align: center;
                input[type="checkbox"] {
                    margin: 0;
                    transform: scale(1.2);
                }
                &.disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
            }
            .book-intro {
                min-width: 200px;
            }
            .intro-cell {
                max-width: 300px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .note-count-column {
                width: 80px;
                text-align: center;
            }
            .note-count-cell {
                text-align: center;
            }
        }
    }

    .section-title {
        font-weight: bold;
        font-size: 14px;
        margin: 16px 0 8px 0;
        padding: 4px 8px;
        background-color: var(--b3-theme-background-light);
        border-left: 3px solid var(--b3-theme-primary);
    }
</style>
