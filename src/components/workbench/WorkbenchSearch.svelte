<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import ContextTutorialLink from "../common/ContextTutorialLink.svelte";
    import { READING_NOTES_LINKS } from "../../utils/core/externalLinks";
    import { secureExternalImageUrl } from "../../utils/core/externalImageUrl";
    import DoubanBookDetailDialog from "../bookSearch/DoubanBookDetailDialog.svelte";
    import type { WorkbenchAction, WorkbenchSearchResult } from "../../types/workbench";
    import { addEditedDoubanBookToDatabase, loadDoubanBookDetail, loadDoubanBookPreferences, searchDoubanBook } from "../../utils/bookSearch/doubanSearchService";
    import { openLocalBookResult, searchLocalBooks } from "../../utils/bookSearch/localBookSearchService";
    import { openWereadBookResult, searchWereadLibraryBooks } from "../../utils/bookSearch/wereadBookSearchService";
    import { getImage } from "../../utils/core/getImg";
    import { svelteDialog } from "../../libs/dialog";
    import { t } from "../../utils/i18n";

    export let plugin: any;
    export let mobile = false;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction; refresh: void }>();

    let query = "";
    let localResults: WorkbenchSearchResult[] = [];
    let doubanResults: WorkbenchSearchResult[] = [];
    let wereadResults: WorkbenchSearchResult[] = [];
    let selectedResult: WorkbenchSearchResult | null = null;
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);
    let statusText = tx("searchIntro", "同时搜索本地阅读内容、豆瓣图书和微信读书个人数据。");
    let isLocalSearching = false;
    let isDoubanSearching = false;
    let isWereadSearching = false;
    let hasSearched = false;
    let isDoubanDetailOpen = false;
    let previewCovers: Record<string, string> = {};
    let localError = "";
    let doubanError = "";
    let wereadError = "";
    let searchRequestId = 0;
    let isSearching = false;

    $: isSearching = isLocalSearching || isDoubanSearching || isWereadSearching;

    function resultKey(result: WorkbenchSearchResult): string {
        return `${result.source}:${result.id}`;
    }

    function isSelected(result: WorkbenchSearchResult): boolean {
        return selectedResult?.source === result.source && selectedResult?.id === result.id;
    }

    function handleQueryInput() {
        searchRequestId += 1;
        localResults = [];
        doubanResults = [];
        wereadResults = [];
        previewCovers = {};
        selectedResult = null;
        isDoubanDetailOpen = false;
        localError = "";
        doubanError = "";
        wereadError = "";
        isLocalSearching = false;
        isDoubanSearching = false;
        isWereadSearching = false;
        hasSearched = false;
        statusText = tx("searchIntro", "同时搜索本地阅读内容、豆瓣图书和微信读书个人数据。");
    }

    function isCurrentSearch(keyword: string, requestId: number): boolean {
        return requestId === searchRequestId && query.trim() === keyword;
    }

    function updateOverallSearchStatus(requestId: number) {
        if (requestId !== searchRequestId || isLocalSearching || isDoubanSearching || isWereadSearching) return;
        statusText = tx("searchComplete", "搜索完成");
    }

    async function loadDoubanCoverPreviews(items: WorkbenchSearchResult[], requestId: number) {
        const next: Record<string, string> = {};
        await Promise.all(items.slice(0, 10).map(async (item) => {
            if (item.source !== "douban" || !item.cover) return;
            try {
                const data = await getImage(item.cover, `https://book.douban.com/subject/${item.id}/`);
                if (data) next[resultKey(item)] = data;
            } catch {
            }
        }));
        if (requestId !== searchRequestId) return;
        previewCovers = { ...previewCovers, ...next };
    }

    function runUnifiedSearch() {
        if (isSearching) return;
        const keyword = query.trim();
        const requestId = ++searchRequestId;
        localResults = [];
        doubanResults = [];
        wereadResults = [];
        previewCovers = {};
        selectedResult = null;
        isDoubanDetailOpen = false;
        localError = "";
        doubanError = "";
        wereadError = "";
        hasSearched = false;
        if (!keyword) {
            statusText = tx("searchEnterQuery", "请输入搜索内容");
            return;
        }

        hasSearched = true;
        statusText = tx("searchSearching", "搜索中");
        isLocalSearching = true;
        isDoubanSearching = true;
        isWereadSearching = true;
        void loadLocalResults(keyword, requestId);
        void loadDoubanResults(keyword, requestId);
        void loadWereadResults(keyword, requestId);
    }

    async function loadLocalResults(keyword: string, requestId: number) {
        try {
            const nextResults = await searchLocalBooks(plugin, keyword);
            if (!isCurrentSearch(keyword, requestId)) return;
            localResults = nextResults;
        } catch (error: any) {
            if (!isCurrentSearch(keyword, requestId)) return;
            localResults = [];
            localError = error?.message
                ? `${tx("searchLocalFailed", "本地搜索失败")}：${error.message}`
                : tx("searchLocalFailed", "本地搜索失败");
        } finally {
            if (requestId === searchRequestId) {
                isLocalSearching = false;
                updateOverallSearchStatus(requestId);
            }
        }
    }

    async function loadDoubanResults(keyword: string, requestId: number) {
        try {
            const nextResults = await searchDoubanBook(plugin, keyword);
            if (!isCurrentSearch(keyword, requestId)) return;
            doubanResults = nextResults;
            previewCovers = {};
            void loadDoubanCoverPreviews(nextResults, requestId);
        } catch (error: any) {
            if (!isCurrentSearch(keyword, requestId)) return;
            doubanResults = [];
            previewCovers = {};
            doubanError = error?.message
                ? `${tx("searchDoubanFailed", "豆瓣搜索失败")}：${error.message}`
                : tx("searchDoubanFailed", "豆瓣搜索失败");
        } finally {
            if (requestId === searchRequestId) {
                isDoubanSearching = false;
                updateOverallSearchStatus(requestId);
            }
        }
    }

    async function loadWereadResults(keyword: string, requestId: number) {
        try {
            const nextResults = await searchWereadLibraryBooks(plugin, keyword);
            if (!isCurrentSearch(keyword, requestId)) return;
            wereadResults = nextResults;
        } catch (error: any) {
            if (!isCurrentSearch(keyword, requestId)) return;
            wereadResults = [];
            wereadError = error?.message
                ? `${tx("searchWereadFailed", "微信读书搜索失败")}：${error.message}`
                : tx("searchWereadFailed", "微信读书搜索失败");
        } finally {
            if (requestId === searchRequestId) {
                isWereadSearching = false;
                updateOverallSearchStatus(requestId);
            }
        }
    }

    async function openDoubanDetailDialog(result: WorkbenchSearchResult) {
        if (!result || result.source !== "douban" || !result.raw) return;
        const detailResult = result;
        const detailRequestId = searchRequestId;
        const detailKeyword = query.trim();
        let addedSuccessfully = false;
        const isDetailContextCurrent = () =>
            detailRequestId === searchRequestId
            && query.trim() === detailKeyword
            && hasSearched;
        const clearStaleDetailState = () => {
            if (selectedResult !== detailResult) return;
            isDoubanDetailOpen = false;
            selectedResult = null;
        };
        selectedResult = result;
        isDoubanDetailOpen = true;
        statusText = tx("searchLoadingDetail", "正在加载豆瓣书籍详情...");

        try {
            result = await loadDoubanBookDetail(result);
            if (!isDetailContextCurrent()) {
                clearStaleDetailState();
                return;
            }
            const preferences = await loadDoubanBookPreferences(plugin);
            if (!isDetailContextCurrent()) {
                clearStaleDetailState();
                return;
            }
            const bookRaw = result.raw as any;
            const bookInfo = {
                ...bookRaw,
                addNotes: bookRaw.addNotes ?? true,
            };

            statusText = tx("searchDetailOpened", "已打开豆瓣图书详情，请确认修改后添加");

            const dialogRef = svelteDialog({
                title: tx("searchConfirmTitle", "确认添加：{title}", { title: bookInfo.title || tx("searchDoubanBook", "豆瓣图书") }),
                width: mobile ? "100vw" : "min(780px, 94vw)",
                height: mobile ? "100dvh" : "min(780px, 88vh)",
                constructor: (container: HTMLElement) =>
                    new DoubanBookDetailDialog({
                        target: container,
                        props: {
                            bookInfo,
                            customRatings: preferences.ratings,
                            customCategories: preferences.categories,
                            customReadingStatuses: preferences.statuses,
                            i18n: plugin.i18n,
                            mobile,
                            close: () => dialogRef.close(),
                        },
                    }),
                callback: () => {
                    isDoubanDetailOpen = false;
                    selectedResult = null;
                    if (
                        !addedSuccessfully
                        && detailRequestId === searchRequestId
                        && query.trim() === detailKeyword
                        && hasSearched
                    ) {
                        statusText = tx("searchComplete", "搜索完成");
                    }
                },
            });
            if (mobile) {
                dialogRef.dialog.element.classList.add("siyuan-douban-mobile-detail-dialog");
            }

            dialogRef.component.$on("confirm", async (event: CustomEvent<any>) => {
                const editedBookInfo = event.detail;
                try {
                    const saveResult = await addEditedDoubanBookToDatabase(plugin, editedBookInfo);
                    showMessage(saveResult?.msg || (saveResult?.code === 0
                        ? tx("searchAddSuccess", "书籍添加成功")
                        : tx("searchAddFailed", "书籍添加失败")));
                    if (saveResult?.code === 0) {
                        addedSuccessfully = true;
                        selectedResult = null;
                        isDoubanDetailOpen = false;
                        statusText = tx("searchAddSuccess", "书籍添加成功");
                        dispatch("refresh");
                        dialogRef.close();
                    }
                } catch (e) {
                    showMessage(tx("searchAddFailedDetail", "添加失败：{error}", { error: e?.message || tx("uiUnknownError", "未知错误") }));
                }
            });
        } catch (error: any) {
            if (!isDetailContextCurrent()) {
                clearStaleDetailState();
                return;
            }
            isDoubanDetailOpen = false;
            selectedResult = null;
            statusText = error?.message || tx("searchDetailFailed", "详情加载失败");
            showMessage(statusText);
        }
    }

    async function chooseResult(result: WorkbenchSearchResult) {
        selectedResult = result;
        if (result.source === "local") {
            openLocalBookResult(plugin, result);
        } else if (result.source === "douban") {
            await openDoubanDetailDialog(result);
        } else if (result.source === "weread") {
            openWereadBookResult(plugin, result);
        }
    }
</script>

<section class="workbench-search" class:workbench-search-mobile={mobile}>
    <div class="workbench-search-head">
        <div>
            <h2>{tx("searchPanelTitle", "阅读内容搜索")}</h2>
            <p>{tx("searchPanelDesc", "一次搜索本地书籍与笔记、豆瓣图书，以及微信读书个人书架和有笔记书籍。")}</p>
        </div>
        <ContextTutorialLink
            href={READING_NOTES_LINKS.addBookTutorial}
            label={tx("tutorialAddBook", "查看搜索与入库教程")}
            compact
        />
    </div>

    <div class="workbench-search-bar">
        <label class="workbench-search-input-wrap">
            <SiYuanIcon name="search" size={16} />
            <input
                bind:value={query}
                type="search"
                inputmode="search"
                enterkeyhint="search"
                autocomplete="off"
                placeholder={tx("searchInputPlaceholder", "搜索书名、作者、简介、笔记内容等")}
                on:input={handleQueryInput}
                on:keydown={(event) => event.key === "Enter" && runUnifiedSearch()}
            />
        </label>
        <button class="workbench-button workbench-button-primary" on:click={runUnifiedSearch} disabled={isSearching}>
            <SiYuanIcon name="search" size={15} />
            <span>{isSearching ? tx("searchSearching", "搜索中") : t(plugin, "searchButton", "搜索")}</span>
        </button>
    </div>

    <div class="workbench-search-status">
        <span>{statusText}</span>
    </div>

    {#if hasSearched && !isDoubanDetailOpen}
        <div class="workbench-search-results-group">
            <h3>{tx("searchLocalResults", "本地搜索结果")}</h3>
            {#if isLocalSearching}
                <div class="workbench-search-source-state" aria-live="polite">{tx("searchLocalSearching", "正在搜索本地内容...")}</div>
            {:else if localError}
                <div class="workbench-search-source-state workbench-search-source-error" role="alert">{localError}</div>
            {:else if localResults.length > 0}
                <div class="workbench-search-results">
                    {#each localResults as result (result.source + ":" + result.id)}
                        <button
                            type="button"
                            class:active={isSelected(result)}
                            class="workbench-search-result"
                            on:click={() => chooseResult(result)}
                        >
                            {#if result.cover}
                                <img src={secureExternalImageUrl(result.cover)} alt="" />
                            {:else}
                                <span class="workbench-search-result-placeholder"><SiYuanIcon name="book" size={18} /></span>
                            {/if}
                            <span class="workbench-search-result-main">
                                <strong>{result.title}</strong>
                            </span>
                            <span class="workbench-search-result-meta">
                                <span class="workbench-search-result-source">{tx("searchLocalBook", "本地书籍")}</span>
                                {#if result.matchPercent !== undefined}
                                    <span class="workbench-search-result-match">{tx("searchMatchPercent", "命中度 {percent}%", { percent: result.matchPercent })}</span>
                                {/if}
                            </span>
                        </button>
                    {/each}
                </div>
            {:else}
                <div class="workbench-search-empty">{tx("searchLocalNoResult", "本地暂无匹配结果")}</div>
            {/if}
        </div>
        <div class="workbench-search-results-group">
            <h3>{tx("searchDoubanResults", "豆瓣搜索结果")}</h3>
            {#if isDoubanSearching}
                <div class="workbench-search-source-state" aria-live="polite">{tx("searchDoubanLoading", "正在搜索豆瓣...")}</div>
            {:else if doubanError}
                <div class="workbench-search-source-state workbench-search-source-error" role="alert">{doubanError}</div>
            {:else if doubanResults.length > 0}
                <div class="workbench-search-results">
                    {#each doubanResults as result (result.source + ":" + result.id)}
                        <button
                            type="button"
                            class:active={isSelected(result)}
                            class="workbench-search-result"
                            on:click={() => chooseResult(result)}
                        >
                            {#if previewCovers[resultKey(result)]}
                                <img src={previewCovers[resultKey(result)]} alt="" />
                            {:else}
                                <span class="workbench-search-result-placeholder"><SiYuanIcon name="book" size={18} /></span>
                            {/if}
                            <span class="workbench-search-result-main">
                                <strong>{result.title}</strong>
                                <em>{result.author || result.isbn || result.description || tx("searchNoSummary", "暂无摘要")}</em>
                            </span>
                            <span class="workbench-search-result-source">{tx("searchDoubanBook", "豆瓣图书")}</span>
                        </button>
                    {/each}
                </div>
            {:else}
                <div class="workbench-search-empty">{tx("searchDoubanNoResult", "豆瓣暂无匹配结果")}</div>
            {/if}
        </div>
        <div class="workbench-search-results-group">
            <h3>{tx("searchWereadResults", "微信读书搜索结果")}</h3>
            {#if isWereadSearching}
                <div class="workbench-search-source-state" aria-live="polite">{tx("searchWereadSearching", "正在搜索微信读书个人书架与笔记数据...")}</div>
            {:else if wereadError}
                <div class="workbench-search-source-state workbench-search-source-error" role="alert">{wereadError}</div>
            {:else if wereadResults.length > 0}
                <div class="workbench-search-results">
                    {#each wereadResults as result (result.source + ":" + result.id)}
                        <button
                            type="button"
                            class:active={isSelected(result)}
                            class="workbench-search-result"
                            on:click={() => chooseResult(result)}
                        >
                            {#if result.cover}
                                <img src={secureExternalImageUrl(result.cover)} alt="" loading="lazy" />
                            {:else}
                                <span class="workbench-search-result-placeholder"><SiYuanIcon name="book" size={18} /></span>
                            {/if}
                            <span class="workbench-search-result-main">
                                <strong>{result.title}</strong>
                                <em>{[result.author, result.description].filter(Boolean).join(" · ") || tx("searchNoSummary", "暂无摘要")}</em>
                            </span>
                            <span class="workbench-search-result-source">{tx("searchWereadBook", "微信读书")}</span>
                        </button>
                    {/each}
                </div>
            {:else}
                <div class="workbench-search-empty">{tx("searchWereadNoResult", "微信读书暂无匹配结果")}</div>
            {/if}
        </div>
    {/if}
</section>

<style>
    .workbench-search {
        display: grid;
        gap: 14px;
        padding: clamp(16px, 2vw, 22px);
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
    }

    .workbench-search-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 16px;
        align-items: center;
    }

    h2 {
        margin: 0;
        font-size: 17px;
        color: var(--b3-theme-on-background);
    }

    p {
        margin: 4px 0 0;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
        line-height: 1.5;
    }

    .workbench-search-bar {
        display: grid;
        grid-template-columns: minmax(220px, 1fr) auto;
        gap: 8px;
    }

    .workbench-search-input-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 34px;
        min-width: 0;
        padding: 0 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        cursor: text;
        transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
    }

    .workbench-search-input-wrap input {
        flex: 1;
        width: 100%;
        height: 100%;
        min-width: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        outline: none;
        color: var(--b3-theme-on-background);
        font: inherit;
        pointer-events: auto;
        user-select: text;
        cursor: text;
    }

    .workbench-search-input-wrap:focus-within {
        border-color: var(--b3-theme-primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 16%, transparent);
    }

    .workbench-search-input-wrap input::placeholder {
        color: var(--b3-theme-on-surface-light);
        opacity: 1;
    }

    .workbench-search-input-wrap :global(.common-icon) {
        pointer-events: none;
    }

    .workbench-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        height: 34px;
        padding: 0 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
    }

    .workbench-button:hover {
        transform: translateY(-1px);
        border-color: var(--b3-theme-primary);
    }

    .workbench-button-primary {
        border-color: var(--b3-theme-primary);
        background: var(--b3-theme-primary);
        color: #fff;
    }

    .workbench-search-status {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .workbench-search-results-group {
        display: grid;
        gap: 8px;
    }

    .workbench-search-results-group h3 {
        margin: 0;
        color: var(--b3-theme-on-background);
        font-size: 13px;
        line-height: 1.3;
    }

    .workbench-search-empty {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .workbench-search-source-state {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .workbench-search-source-error {
        color: var(--b3-theme-error);
    }

    .workbench-search-results {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
    }

    .workbench-search-result {
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        min-width: 0;
        padding: 9px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        text-align: left;
    }

    .workbench-search-result:hover,
    .workbench-search-result.active {
        border-color: var(--b3-theme-primary);
    }

    .workbench-search-result img,
    .workbench-search-result-placeholder {
        width: 38px;
        height: 48px;
        border-radius: 5px;
        object-fit: cover;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-surface));
    }

    .workbench-search-result-placeholder {
        display: grid;
        place-items: center;
        color: var(--b3-theme-primary);
    }

    .workbench-search-result-main {
        display: grid;
        gap: 4px;
        min-width: 0;
    }

    .workbench-search-result-main strong,
    .workbench-search-result-main em {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .workbench-search-result-main strong {
        font-size: 13px;
    }

    .workbench-search-result-main em {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        font-style: normal;
    }

    .workbench-search-result-meta {
        display: grid;
        gap: 2px;
        justify-items: end;
        min-width: max-content;
    }

    .workbench-search-result-source,
    .workbench-search-result-match {
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
        line-height: 1.3;
        white-space: nowrap;
    }

    @media (max-width: 980px) {
        .workbench-search-head,
        .workbench-search-bar {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 720px) {
        .workbench-search-results {
            grid-template-columns: 1fr;
        }
    }

    .workbench-search-mobile {
        gap: 12px;
        padding: 14px;
        border-radius: 14px;
    }

    .workbench-search-mobile .workbench-search-head p {
        font-size: 12px;
    }

    .workbench-search-mobile .workbench-search-bar {
        grid-template-columns: 1fr;
    }

    .workbench-search-mobile .workbench-search-input-wrap,
    .workbench-search-mobile .workbench-button {
        min-height: 44px;
        height: 44px;
        border-radius: 10px;
    }

    .workbench-search-mobile .workbench-search-input-wrap input {
        font-size: 16px;
    }

    .workbench-search-mobile .workbench-search-results {
        grid-template-columns: 1fr;
        gap: 10px;
    }

    .workbench-search-mobile .workbench-search-result {
        grid-template-columns: 48px minmax(0, 1fr);
        min-height: 66px;
        padding: 10px;
        border-radius: 12px;
    }

    .workbench-search-mobile .workbench-search-result img,
    .workbench-search-mobile .workbench-search-result-placeholder {
        width: 48px;
        height: 60px;
    }

    .workbench-search-mobile .workbench-search-result-meta {
        grid-column: 2;
        grid-row: 2;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-self: start;
        justify-self: start;
        min-width: 0;
        max-width: 100%;
    }

    .workbench-search-mobile .workbench-search-result-match::before {
        content: "·";
        margin-right: 4px;
        color: var(--b3-theme-on-surface-light);
    }

    .workbench-search-mobile .workbench-search-result-source,
    .workbench-search-mobile .workbench-search-result-match {
        display: inline-block;
    }
</style>
