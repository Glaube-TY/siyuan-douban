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
    import { getImage } from "../../utils/core/getImg";
    import { svelteDialog } from "../../libs/dialog";
    import { t } from "../../utils/i18n";

    export let plugin: any;
    export let mobile = false;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction; refresh: void }>();

    let query = "";
    let localResults: WorkbenchSearchResult[] = [];
    let doubanResults: WorkbenchSearchResult[] = [];
    let selectedResult: WorkbenchSearchResult | null = null;
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);
    let statusText = tx("searchIntro", "优先搜索本地书籍与笔记内容，需要时可继续搜索豆瓣书籍。");
    let isLocalSearching = false;
    let isDoubanSearching = false;
    let hasLocalSearched = false;
    let isDoubanDetailOpen = false;
    let previewCovers: Record<string, string> = {};

    function resultKey(result: WorkbenchSearchResult): string {
        return `${result.source}:${result.id}`;
    }

    function isSelected(result: WorkbenchSearchResult): boolean {
        return selectedResult?.source === result.source && selectedResult?.id === result.id;
    }

    function handleQueryInput() {
        localResults = [];
        doubanResults = [];
        previewCovers = {};
        selectedResult = null;
        hasLocalSearched = false;
        statusText = tx("searchIntro", "优先搜索本地书籍与笔记内容，需要时可继续搜索豆瓣书籍。");
    }

    async function loadDoubanCoverPreviews(items: WorkbenchSearchResult[]) {
        const next: Record<string, string> = {};
        await Promise.all(items.slice(0, 10).map(async (item) => {
            if (item.source !== "douban" || !item.cover) return;
            const data = await getImage(item.cover, `https://book.douban.com/subject/${item.id}/`);
            if (data) next[resultKey(item)] = data;
        }));
        previewCovers = { ...previewCovers, ...next };
    }

    async function runLocalSearch() {
        if (isLocalSearching || isDoubanSearching) return;
        const keyword = query.trim();
        localResults = [];
        doubanResults = [];
        previewCovers = {};
        selectedResult = null;
        hasLocalSearched = false;
        if (!keyword) {
            statusText = tx("searchEnterQuery", "请输入搜索内容");
            return;
        }

        isLocalSearching = true;
        try {
            const nextResults = await searchLocalBooks(plugin, keyword);
            if (query.trim() !== keyword) return;
            localResults = nextResults;
            hasLocalSearched = true;
            statusText = nextResults.length
                ? tx("searchLocalFound", "本地找到 {count} 本匹配书籍", { count: nextResults.length })
                : tx("searchLocalNoResult", "本地暂无匹配内容，可继续搜索豆瓣书籍");
        } catch (error: any) {
            if (query.trim() !== keyword) return;
            localResults = [];
            hasLocalSearched = true;
            statusText = error?.message || tx("searchFailed", "搜索失败");
            showMessage(statusText);
        } finally {
            isLocalSearching = false;
        }
    }

    async function runDoubanSearch() {
        const keyword = query.trim();
        if (!keyword || isDoubanSearching) return;
        isDoubanSearching = true;
        selectedResult = null;
        try {
            const nextResults = await searchDoubanBook(plugin, keyword);
            if (query.trim() !== keyword) return;
            doubanResults = nextResults;
            statusText = nextResults.length
                ? tx("searchDoubanFound", "豆瓣找到 {count} 本匹配书籍", { count: nextResults.length })
                : tx("searchDoubanNoResult", "豆瓣暂无匹配结果");
            previewCovers = {};
            void loadDoubanCoverPreviews(nextResults);
            if (nextResults.length === 1 && (nextResults[0].raw as any)?.detailLoaded) {
                await openDoubanDetailDialog(nextResults[0]);
            }
        } catch (error: any) {
            if (query.trim() !== keyword) return;
            doubanResults = [];
            previewCovers = {};
            statusText = error?.message || tx("searchFailed", "搜索失败");
            showMessage(statusText);
        } finally {
            isDoubanSearching = false;
        }
    }

    async function openDoubanDetailDialog(result: WorkbenchSearchResult) {
        if (!result || result.source !== "douban" || !result.raw) return;
        selectedResult = result;
        isDoubanDetailOpen = true;
        statusText = tx("searchLoadingDetail", "正在加载豆瓣书籍详情...");

        try {
            result = await loadDoubanBookDetail(result);
            const preferences = await loadDoubanBookPreferences(plugin);
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
                    doubanResults = [];
                    previewCovers = {};
                    selectedResult = null;
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
                        doubanResults = [];
                        previewCovers = {};
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
            isDoubanDetailOpen = false;
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
        }
    }
</script>

<section class="workbench-search" class:workbench-search-mobile={mobile}>
    <div class="workbench-search-head">
        <div>
            <h2>{tx("searchPanelTitle", "豆瓣读书书籍搜索导入")}</h2>
            <p>{tx("searchPanelDesc", "从豆瓣读书搜索书籍，确认详情后导入本地阅读数据库。")}</p>
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
                on:keydown={(event) => event.key === "Enter" && runLocalSearch()}
            />
        </label>
        <button class="workbench-button workbench-button-primary" on:click={runLocalSearch} disabled={isLocalSearching || isDoubanSearching}>
            <SiYuanIcon name="search" size={15} />
            <span>{isLocalSearching ? tx("searchSearching", "搜索中") : t(plugin, "searchButton", "搜索")}</span>
        </button>
    </div>

    <div class="workbench-search-status">
        <span>{statusText}</span>
    </div>

    {#if hasLocalSearched && !isDoubanDetailOpen}
        <div class="workbench-search-results-group">
            <h3>{tx("searchLocalResults", "本地搜索结果")}</h3>
            {#if localResults.length > 0}
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
                <div class="workbench-search-empty">{tx("searchLocalNoResult", "本地暂无匹配内容，可继续搜索豆瓣书籍")}</div>
            {/if}
            {#if query.trim()}
                <button type="button" class="workbench-button workbench-search-douban-button" on:click={runDoubanSearch} disabled={isDoubanSearching}>
                    <SiYuanIcon name="search" size={15} />
                    <span>{isDoubanSearching ? tx("searchDoubanSearching", "搜索豆瓣中") : tx("searchDoubanContinue", "搜索豆瓣书籍")}</span>
                </button>
            {/if}
        </div>
    {/if}

    {#if doubanResults.length > 0 && !isDoubanDetailOpen}
        <div class="workbench-search-results-group">
            <h3>{tx("searchDoubanResults", "豆瓣搜索结果")}</h3>
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

    .workbench-search-douban-button {
        justify-self: start;
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
