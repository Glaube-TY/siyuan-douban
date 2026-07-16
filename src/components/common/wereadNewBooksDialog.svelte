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
    let processingMessage = "";

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

    // 普通书可选择基础集合：仅判断 ISBN 有效，不排除忽略/使用BookID
    $: selectableNormalBookBase = normalBooks.filter(
        b => isValidISBN(b.isbn)
    );

    // 公众号可选项：未忽略
    $: selectableMpAccounts = mpAccounts.filter(
        b => !ignoredBooks.some(ib => ib.bookID === b.bookID)
    );

    $: allNormalSelected =
        selectableNormalBookBase.length > 0 &&
        selectableNormalBookBase.every((book) => selectedBooks.some((b) => b.bookID === book.bookID));

    $: allMpSelected =
        selectableMpAccounts.length > 0 &&
        selectableMpAccounts.every((book) => selectedBooks.some((b) => b.bookID === book.bookID));

    $: allNormalIgnored =
        normalBooks.length > 0 &&
        normalBooks.every(book => ignoredBooks.some(b => b.bookID === book.bookID));

    $: allMpIgnored =
        mpAccounts.length > 0 &&
        mpAccounts.every(book => ignoredBooks.some(b => b.bookID === book.bookID));

    $: allNormalUseBookID =
        normalBooks.length > 0 &&
        normalBooks.every(book => useBookIDs.some(b => b.bookID === book.bookID));

    // 是否有有效确认选择（选中书籍或useBookID）
    $: hasConfirmSelection = selectedBooks.length > 0 || useBookIDs.length > 0;

    function getBookIDSet(items: BookItem[]) {
        return new Set(items.map(b => b.bookID));
    }

    function toggleAllNormalBooks() {
        const ids = getBookIDSet(selectableNormalBookBase);
        if (allNormalSelected) {
            selectedBooks = selectedBooks.filter(b => !ids.has(b.bookID));
        } else {
            ignoredBooks = ignoredBooks.filter(b => !ids.has(b.bookID));
            useBookIDs = useBookIDs.filter(b => !ids.has(b.bookID));
            const exists = new Set(selectedBooks.map(b => b.bookID));
            selectedBooks = [...selectedBooks, ...selectableNormalBookBase.filter(b => !exists.has(b.bookID))];
        }
        selectedBooks = [...selectedBooks];
        ignoredBooks = [...ignoredBooks];
        useBookIDs = [...useBookIDs];
    }

    function toggleAllMpAccounts() {
        const ids = getBookIDSet(selectableMpAccounts);
        if (allMpSelected) {
            selectedBooks = selectedBooks.filter(b => !ids.has(b.bookID));
        } else {
            ignoredBooks = ignoredBooks.filter(b => !ids.has(b.bookID));
            const exists = new Set(selectedBooks.map(b => b.bookID));
            selectedBooks = [...selectedBooks, ...selectableMpAccounts.filter(b => !exists.has(b.bookID))];
        }
        selectedBooks = [...selectedBooks];
        ignoredBooks = [...ignoredBooks];
        useBookIDs = [...useBookIDs];
    }

    function toggleAllNormalIgnored() {
        const ids = getBookIDSet(normalBooks);
        if (allNormalIgnored) {
            ignoredBooks = ignoredBooks.filter(b => !ids.has(b.bookID));
        } else {
            selectedBooks = selectedBooks.filter(b => !ids.has(b.bookID));
            useBookIDs = useBookIDs.filter(b => !ids.has(b.bookID));
            const exists = new Set(ignoredBooks.map(b => b.bookID));
            ignoredBooks = [...ignoredBooks, ...normalBooks.filter(b => !exists.has(b.bookID))];
        }
        selectedBooks = [...selectedBooks];
        ignoredBooks = [...ignoredBooks];
        useBookIDs = [...useBookIDs];
    }

    function toggleAllMpIgnored() {
        const ids = getBookIDSet(mpAccounts);
        if (allMpIgnored) {
            ignoredBooks = ignoredBooks.filter(b => !ids.has(b.bookID));
        } else {
            selectedBooks = selectedBooks.filter(b => !ids.has(b.bookID));
            const exists = new Set(ignoredBooks.map(b => b.bookID));
            ignoredBooks = [...ignoredBooks, ...mpAccounts.filter(b => !exists.has(b.bookID))];
        }
        selectedBooks = [...selectedBooks];
        ignoredBooks = [...ignoredBooks];
        useBookIDs = [...useBookIDs];
    }

    function toggleAllNormalUseBookID() {
        const ids = getBookIDSet(normalBooks);
        if (allNormalUseBookID) {
            useBookIDs = useBookIDs.filter(b => !ids.has(b.bookID));
        } else {
            selectedBooks = selectedBooks.filter(b => !ids.has(b.bookID));
            ignoredBooks = ignoredBooks.filter(b => !ids.has(b.bookID));
            const exists = new Set(useBookIDs.map(b => b.bookID));
            useBookIDs = [...useBookIDs, ...normalBooks.filter(b => !exists.has(b.bookID))];
        }
        selectedBooks = [...selectedBooks];
        ignoredBooks = [...ignoredBooks];
        useBookIDs = [...useBookIDs];
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
        processingMessage = i18n.wereadNewSourcesConfirmProcessing || "正在处理选择的新来源，请稍候...";
        isProcessing = true;
        try {
            await onConfirm(selectedBooks, ignoredBooks, useBookIDs);
        } finally {
            isProcessing = false;
        }
    }

    async function handleContinue() {
        if (isProcessing) return;
        processingMessage = i18n.wereadNewSourcesContinueProcessing || "正在继续同步已有书籍，请稍候...";
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

        {#if processingMessage}
            <div class="new-sources-processing-tip">{processingMessage}</div>
        {/if}

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
                <th class="ignore-column" title={i18n.choiceExclusiveTip}>
                    <input
                        type="checkbox"
                        title={i18n.ignoreAll || "全部忽略"}
                        on:change={toggleAllNormalIgnored}
                        checked={allNormalIgnored}
                    />
                    {i18n.ignore}
                </th>
                <th class="use-bookid-column" title={i18n.choiceExclusiveTip}>
                    <input
                        type="checkbox"
                        title={i18n.useBookIDAll || "全部使用BookID"}
                        on:change={toggleAllNormalUseBookID}
                        checked={allNormalUseBookID}
                    />
                    {i18n.useBookID}
                </th>
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
                <th class="ignore-column">
                    <input
                        type="checkbox"
                        title={i18n.ignoreAll || "全部忽略"}
                        on:change={toggleAllMpIgnored}
                        checked={allMpIgnored}
                    />
                    {i18n.ignore}
                </th>
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
        max-height: calc(86dvh - 64px);
        overflow-x: auto;
        overflow-y: auto;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;

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

        .new-sources-processing-tip {
            margin: 8px auto 12px;
            padding: 8px 12px;
            max-width: 520px;
            border: 1px solid var(--b3-border-color);
            border-radius: 8px;
            background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-surface));
            color: var(--b3-theme-on-surface);
            text-align: center;
            font-size: 13px;
            line-height: 1.5;
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
                    color: #fff;
                    font-weight: 500;
                }

                &:hover:not(.active) {
                    background: var(--b3-list-hover);
                }
            }
        }

        .book-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            margin: 10px 0;

            th:first-child,
            td:first-child {
                width: 76px;
            }

            .book-title {
                width: 28%;
            }

            .book-isbn {
                width: 34%;
            }

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
                background-color: var(--b3-theme-surface-light);
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
                width: 96px;
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
                width: 118px;
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

    @media (max-width: 600px) {
        .notebooks-dialog {
            max-height: calc(100dvh - 48px);
            padding:
                8px
                calc(8px + env(safe-area-inset-right))
                calc(8px + env(safe-area-inset-bottom))
                calc(8px + env(safe-area-inset-left));
            touch-action: pan-x pan-y;

            .confirm-btn-container {
                position: sticky;
                top: 0;
                z-index: 2;
                flex-wrap: wrap;
                padding: 4px 0 8px;
                background: var(--b3-theme-background);

                button {
                    flex: 1 1 30%;
                    min-width: 88px;
                    min-height: 40px;
                    padding: 8px 10px;
                }
            }

            .tab-bar {
                overflow-x: auto;
                padding-bottom: 2px;

                .tab-btn {
                    flex: 0 0 auto;
                }
            }

            .book-table {
                min-width: 720px;
            }
        }
    }
</style>
