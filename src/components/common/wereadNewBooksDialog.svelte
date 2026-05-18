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

    let activeTab: "books" | "mp" = "books";

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

    // 默认标签页：优先书籍，没有书籍则默认公众号
    $: if (normalBooks.length === 0 && mpAccounts.length > 0) {
        activeTab = "mp";
    } else if (normalBooks.length > 0) {
        activeTab = "books";
    }

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
            selectedBooks = selectedBooks.filter(b => b.sourceType === "weread_mp_account" || !selectableNormalBooks.some(sb => sb.bookID === b.bookID));
        } else {
            const toAdd = selectableNormalBooks.filter(b => !selectedBooks.some(sb => sb.bookID === b.bookID));
            selectedBooks = [...selectedBooks, ...toAdd];
        }
    }

    function toggleAllMpAccounts() {
        if (allMpSelected) {
            selectedBooks = selectedBooks.filter(b => b.sourceType !== "weread_mp_account" || !selectableMpAccounts.some(sb => sb.bookID === b.bookID));
        } else {
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
            const ignoreIndex = ignoredBooks.findIndex((b) => b.bookID === book.bookID);
            if (ignoreIndex > -1) {
                ignoredBooks.splice(ignoreIndex, 1);
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

    function toggleIgnore(book: BookItem) {
        const isMp = book.sourceType === "weread_mp_account";
        const index = ignoredBooks.findIndex((b) => b.bookID === book.bookID);
        if (index > -1) {
            ignoredBooks.splice(index, 1);
        } else {
            ignoredBooks.push(book);
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

    async function handleConfirm() {
        if (isProcessing) return;
        isProcessing = true;
        try {
            await onConfirm(selectedBooks, ignoredBooks, useBookIDs);
        } finally {
            isProcessing = false;
        }
    }

    async function handleContinue() {
        if (isProcessing) return;
        isProcessing = true;
        try {
            await onContinue(ignoredBooks);
        } finally {
            isProcessing = false;
        }
    }

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
        <button class="cancel-btn" on:click={handleCancel} disabled={isProcessing}>{i18n.cancelSync}</button>
    </div>

    <!-- 标签页按钮 -->
    {#if normalBooks.length > 0 || mpAccounts.length > 0}
    <div class="tab-bar">
        {#if normalBooks.length > 0}
        <button
            class="tab-btn"
            class:active={activeTab === "books"}
            on:click={() => { activeTab = "books"; }}
        >{i18n.newBooksTabBooks}（{normalBooks.length}）</button>
        {/if}
        {#if mpAccounts.length > 0}
        <button
            class="tab-btn"
            class:active={activeTab === "mp"}
            on:click={() => { activeTab = "mp"; }}
        >{i18n.newBooksTabMpAccounts}（{mpAccounts.length}）</button>
        {/if}
    </div>
    {/if}

    <!-- 新书籍表格 -->
    {#if activeTab === "books" && normalBooks.length > 0}
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
                <th class="ignore-column" title={i18n.choiceExclusiveTip}>{i18n.ignore}</th>
                <th class="use-bookid-column" title={i18n.choiceExclusiveTip}>{i18n.useBookID}</th>
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
                    <td>{book.title || book.bookID || i18n.unnamedBook}</td>
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
    {#if activeTab === "mp" && mpAccounts.length > 0}
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
                <th class="book-title">{i18n.mpAccountName}</th>
                <th class="book-intro">{i18n.mpAccountIntro}</th>
                <th class="note-count-column">{i18n.noteReviewCount}</th>
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
                    <td>{book.title || book.bookID || i18n.unnamedMpAccount}</td>
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

        .tab-bar {
            display: flex;
            gap: 8px;
            margin: 12px 0 8px 0;

            .tab-btn {
                padding: 6px 16px;
                border: 1px solid var(--b3-border-color);
                border-radius: 6px;
                background: transparent;
                color: var(--b3-theme-on-background);
                font-size: 13px;
                cursor: pointer;
                transition: background 0.15s ease, color 0.15s ease;

                &.active {
                    background: var(--b3-theme-primary);
                    color: var(--b3-theme-on-primary, #fff);
                    font-weight: 500;
                }

                &:hover:not(.active) {
                    background: var(--b3-list-hover);
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
</style>
