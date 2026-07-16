<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import { loadLocalBookSearchState } from "../../utils/bookSearch/localBookSearchService";
    import { loadWereadCachedBooks } from "../../utils/bookSearch/wereadBookSearchService";
    import { secureExternalImageUrl } from "../../utils/core/externalImageUrl";
    import { loadWereadAuthState } from "../../utils/settings/wereadSettingsService";
    import { attachWereadApiLocalNoteDocs } from "../../utils/weread/api/findWereadApiBookTargetDoc";
    import { getNoteDocumentBindingLabel, type NoteDocumentBindingState } from "../../utils/readingManagement/noteDocumentBinding";
    import { buildApiBookShelf } from "../../utils/weread/api/buildApiBookShelf";
    import { openDoc } from "../../utils/openDoc";

    export let plugin: any;
    export let refreshKey = 0;

    type ShelfType = "local" | "weread-notes" | "weread-shelf";
    const tabs: Array<{ key: ShelfType; label: string; icon: string }> = [
        { key: "local", label: "本地书架", icon: "localShelf" },
        { key: "weread-notes", label: "有笔记书籍", icon: "weread" },
        { key: "weread-shelf", label: "微信读书书架", icon: "weread" },
    ];

    let activeTab: ShelfType = "local";
    let query = "";
    let isLoading = false;

    let localBooks: any[] = [];
    let wereadNotesBooks: any[] = [];
    let shelfBooks: any[] = [];
    let shelfLoaded = false;

    let lastRefreshKey = refreshKey;

    // 显式依赖三个数组，确保异步加载后自动重算
    $: currentBooks =
        activeTab === "local" ? localBooks :
        activeTab === "weread-notes" ? wereadNotesBooks :
        shelfBooks;
    $: filteredBooks = filterBookList(currentBooks, query);
    $: emptyMessage = getEmptyMessage(activeTab);

    function filterBookList(books: any[], q: string): any[] {
        const keyword = String(q || "").trim().toLowerCase();
        if (!keyword) return books;
        return books.filter((b) => {
            const haystack = [b.title, b.author, b.isbn, b.ISBN, b.publisher, b.category]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return haystack.includes(keyword);
        });
    }

    function getEmptyMessage(tab: ShelfType): string {
        if (tab === "local") return "暂无本地书籍，请先配置数据库或添加书籍";
        if (tab === "weread-notes") return "暂无有笔记书籍缓存，请先执行微信读书同步";
        return "暂无微信读书书架缓存，可点击刷新获取";
    }

    function getLocalDocId(book: any): string {
        return book.noteDocumentBindingState === "bound" || (!book.noteDocumentBindingState && book.localDocBlockID)
            ? String(book.localDocBlockID || "").trim()
            : "";
    }

    function canOpenLocalDoc(book: any): boolean {
        return !!getLocalDocId(book);
    }

    function getBindingLabel(book: any): string {
        const state = (book.noteDocumentBindingState || (canOpenLocalDoc(book) ? "bound" : "not_created")) as NoteDocumentBindingState;
        return getNoteDocumentBindingLabel(state);
    }

    async function loadLocal() {
        const state = await loadLocalBookSearchState(plugin);
        localBooks = state.books || [];
    }

    async function loadWereadNotes() {
        let books = await loadWereadCachedBooks(plugin);
        if (books.length > 0) {
            try {
                books = await attachWereadApiLocalNoteDocs(plugin, books);
            } catch {
                // 补充失败不影响展示
            }
        }
        wereadNotesBooks = books;
    }

    async function refreshShelf() {
        const auth = await loadWereadAuthState(plugin);
        if (!auth.verified || !auth.apiKey) {
            showMessage("请先验证微信读书 API Key");
            return;
        }
        isLoading = true;
        shelfLoaded = false; // 强制重新获取
        try {
            const notebooksList = await loadWereadCachedBooks(plugin);
            const list = await buildApiBookShelf(auth.apiKey, notebooksList);
            let enhanced = list;
            try {
                enhanced = await attachWereadApiLocalNoteDocs(plugin, list);
            } catch {
                // 补充失败不影响
            }
            shelfBooks = enhanced;
            shelfLoaded = true;
            await plugin.saveData("weread_api_bookshelf_cache", enhanced);
        } catch (e) {
            showMessage(`刷新微信读书书架失败：${e?.message || "未知错误"}`);
        } finally {
            isLoading = false;
        }
    }

    async function loadShelfFromCache() {
        try {
            const cache = await plugin.loadData("weread_api_bookshelf_cache");
            if (Array.isArray(cache) && cache.length > 0) {
                const validated = await attachWereadApiLocalNoteDocs(plugin, cache);
                shelfBooks = validated;
                shelfLoaded = true;
                await plugin.saveData("weread_api_bookshelf_cache", validated);
            }
        } catch {
            // 忽略
        }
    }

    async function ensureWereadShelfLoaded() {
        if (shelfLoaded && shelfBooks.length > 0) return;
        const auth = await loadWereadAuthState(plugin);
        if (!auth.verified || !auth.apiKey) {
            showMessage("请先验证微信读书 API Key");
            return;
        }
        isLoading = true;
        try {
            const notebooksList = await loadWereadCachedBooks(plugin);
            const list = await buildApiBookShelf(auth.apiKey, notebooksList);
            let enhanced = list;
            try {
                enhanced = await attachWereadApiLocalNoteDocs(plugin, list);
            } catch {
                // 补充失败不影响
            }
            shelfBooks = enhanced;
            shelfLoaded = true;
            await plugin.saveData("weread_api_bookshelf_cache", enhanced);
        } catch (e) {
            showMessage(`获取微信读书书架失败：${e?.message || "未知错误"}`);
        } finally {
            isLoading = false;
        }
    }

    async function switchTab(tab: ShelfType) {
        activeTab = tab;
        query = "";
        if (tab === "weread-shelf") {
            await ensureWereadShelfLoaded();
        }
    }

    function openBook(book: any) {
        const docId = getLocalDocId(book);
        if (docId) {
            openDoc(plugin, docId, 1);
        } else {
            showMessage(`${getBindingLabel(book)}，暂无可打开的本地笔记文档`);
        }
    }

    function openBookBtn(book: any, event: MouseEvent) {
        event.stopPropagation();
        openBook(book);
    }

    async function init() {
        isLoading = true;
        try {
            await Promise.all([loadLocal(), loadWereadNotes(), loadShelfFromCache()]);
        } finally {
            isLoading = false;
        }
    }

    onMount(init);

    $: if (refreshKey !== lastRefreshKey) {
        lastRefreshKey = refreshKey;
        init();
    }
</script>

<section class="workbench-panel shelf-hub">
    <div class="workbench-panel-head">
        <div class="workbench-panel-title">
            <SiYuanIcon name="localShelf" size={18} />
            <h2>书架中心</h2>
        </div>
        <div class="shelf-hub-actions">
            {#if activeTab === "weread-shelf"}
                <button class="workbench-panel-link" on:click={refreshShelf} disabled={isLoading}>
                    <SiYuanIcon name="sync" size={14} />
                    <span>刷新微信读书书架</span>
                </button>
            {/if}
        </div>
    </div>

    <div class="shelf-hub-tabs" role="tablist">
        {#each tabs as tab (tab.key)}
            <button
                class:active={activeTab === tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                on:click={() => switchTab(tab.key)}
            >
                <SiYuanIcon name={tab.icon} pluginName={plugin.name} size={14} />
                <span>{tab.label}</span>
                <span class="shelf-hub-tab-count">
                    {#if tab.key === "local"}{localBooks.length}
                    {:else if tab.key === "weread-notes"}{wereadNotesBooks.length}
                    {:else}{shelfBooks.length}{/if}
                </span>
            </button>
        {/each}
    </div>

    <div class="shelf-hub-toolbar">
        <div class="shelf-hub-search">
            <SiYuanIcon name="search" size={14} />
            <input
                class="b3-text-field"
                bind:value={query}
                placeholder="搜索书名、作者、ISBN"
            />
        </div>
        <button class="workbench-panel-link" on:click={activeTab === "weread-shelf" ? refreshShelf : init} disabled={isLoading}>
            <SiYuanIcon name="refresh" size={14} />
            <span>{activeTab === "weread-shelf" ? "刷新书架" : "刷新"}</span>
        </button>
    </div>

    <div class="shelf-hub-content">
        {#if isLoading}
            <div class="shelf-hub-empty">加载中...</div>
        {:else if filteredBooks.length === 0}
            <div class="shelf-hub-empty">{emptyMessage}</div>
        {:else}
            <div class="shelf-hub-grid">
                {#each filteredBooks as book (book.bookID || book.isbn || book.blockID || book.title)}
                    <div class="shelf-hub-card" role="button" tabindex="0" on:click={() => openBook(book)} on:keydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openBook(book); } }}>
                        {#if book.cover}
                            <img src={secureExternalImageUrl(book.cover)} alt="" class="shelf-hub-cover" />
                        {:else}
                            <div class="shelf-hub-cover-placeholder">
                                <SiYuanIcon name="book" size={20} />
                            </div>
                        {/if}
                        <div class="shelf-hub-card-info">
                            <strong class="shelf-hub-card-title">{book.title || "未命名书籍"}</strong>
                            <em class="shelf-hub-card-author">{book.author || ""}</em>
                            <div class="shelf-hub-card-badges">
                                {#if book.noteCount || book.totalNoteCount}
                                    <span class="shelf-hub-card-badge">{book.totalNoteCount ?? book.noteCount} 笔记</span>
                                {/if}
                                {#if canOpenLocalDoc(book)}
                                    <span class="shelf-hub-card-badge shelf-hub-card-badge--ok">{getBindingLabel(book)}</span>
                                {:else}
                                    <span class="shelf-hub-card-badge">{getBindingLabel(book)}</span>
                                {/if}
                                {#if activeTab === "weread-shelf" && book.sourceType}
                                    <span class="shelf-hub-card-badge">{book.sourceType === "weread_mp_account" ? "公众号" : "书籍"}</span>
                                {/if}
                            </div>
                            {#if canOpenLocalDoc(book)}
                                <button class="shelf-hub-card-open-btn" on:click={(e) => openBookBtn(book, e)}>打开笔记</button>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</section>

<style>
    .shelf-hub {
        display: grid;
        gap: 12px;
    }

    .workbench-panel {
        display: grid;
        gap: 14px;
        padding: 16px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
    }

    .workbench-panel-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
    }

    .workbench-panel-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--b3-theme-primary);
    }

    h2 {
        margin: 0;
        color: var(--b3-theme-on-background);
        font-size: 16px;
    }

    .shelf-hub-actions {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .workbench-panel-link {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 28px;
        padding: 0 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        font-size: 12px;
    }

    .workbench-panel-link:hover {
        border-color: var(--b3-theme-primary);
    }

    .workbench-panel-link:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* pill 切换标签 */
    .shelf-hub-tabs {
        display: inline-flex;
        gap: 4px;
        padding: 4px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
    }

    .shelf-hub-tabs button {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 30px;
        padding: 0 12px;
        border: 1px solid transparent;
        border-radius: 7px;
        background: transparent;
        color: var(--b3-theme-on-background);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: border-color 0.16s ease, background 0.16s ease;
    }

    .shelf-hub-tabs button.active {
        background: var(--b3-theme-surface);
        border-color: var(--b3-border-color);
        color: var(--b3-theme-primary);
    }

    .shelf-hub-tab-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 9px;
        background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
        color: var(--b3-theme-primary);
        font-size: 10px;
        font-weight: 700;
    }

    /* 搜索栏 */
    .shelf-hub-toolbar {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .shelf-hub-search {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        min-width: 0;
        padding: 0 10px;
        height: 30px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
    }

    .shelf-hub-search input {
        flex: 1;
        min-width: 0;
        border: 0;
        background: transparent;
        font-size: 12px;
        box-shadow: none;
    }

    .shelf-hub-search :global(.common-icon) {
        pointer-events: none;
        flex-shrink: 0;
    }

    /* 内容区 */
    .shelf-hub-content {
        max-height: 520px;
        overflow: auto;
    }

    .shelf-hub-empty {
        display: grid;
        place-items: center;
        min-height: 120px;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
    }

    /* 卡片网格 */
    .shelf-hub-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 12px;
    }

    .shelf-hub-card {
        display: grid;
        grid-template-columns: 52px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
        padding: 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        text-align: left;
        transition: border-color 0.16s ease;
        user-select: none;
    }

    .shelf-hub-card:hover,
    .shelf-hub-card:focus-visible {
        border-color: var(--b3-theme-primary);
        outline: none;
    }

    .shelf-hub-cover {
        width: 52px;
        height: 68px;
        border-radius: 4px;
        object-fit: cover;
    }

    .shelf-hub-cover-placeholder {
        display: grid;
        place-items: center;
        width: 52px;
        height: 68px;
        border-radius: 4px;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-surface));
        color: var(--b3-theme-primary);
    }

    .shelf-hub-card-info {
        display: grid;
        gap: 3px;
        min-width: 0;
    }

    .shelf-hub-card-title {
        font-size: 13px;
        line-height: 1.35;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        word-break: break-word;
    }

    .shelf-hub-card-author {
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
        font-style: normal;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .shelf-hub-card-badge {
        display: inline-flex;
        align-items: center;
        height: 18px;
        padding: 0 6px;
        border-radius: 4px;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
        color: var(--b3-theme-on-surface-light);
        font-size: 10px;
        font-weight: 600;
        width: fit-content;
    }

    .shelf-hub-card-badge--ok {
        color: var(--b3-theme-primary);
    }

    .shelf-hub-card-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .shelf-hub-card-open-btn {
        display: inline-flex;
        align-items: center;
        height: 22px;
        padding: 0 8px;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-primary);
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        width: fit-content;
        transition: border-color 0.16s ease;
    }

    .shelf-hub-card-open-btn:hover {
        border-color: var(--b3-theme-primary);
    }

    @media (max-width: 640px) {
        .shelf-hub-tabs {
            flex-wrap: wrap;
        }

        .shelf-hub-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
