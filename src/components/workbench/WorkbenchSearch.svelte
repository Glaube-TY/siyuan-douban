<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import DoubanBookDetailDialog from "../bookSearch/DoubanBookDetailDialog.svelte";
    import type { WorkbenchAction, WorkbenchSearchResult } from "../../types/workbench";
    import { addEditedDoubanBookToDatabase, loadDoubanBookPreferences, searchDoubanBook } from "../../utils/bookSearch/doubanSearchService";
    import { svelteDialog } from "../../libs/dialog";

    export let plugin: any;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction; refresh: void }>();

    let query = "";
    let searchInput: HTMLInputElement;
    let results: WorkbenchSearchResult[] = [];
    let selectedResult: WorkbenchSearchResult | null = null;
    let statusText = "搜索豆瓣书名、ISBN 或作者后导入本地数据库";
    let isSearching = false;
    let isDoubanDetailOpen = false;

    async function runSearch() {
        isSearching = true;
        selectedResult = null;
        try {
            results = await searchDoubanBook(plugin, query);
            statusText = results.length ? `找到 ${results.length} 条结果` : "暂无匹配结果";
            if (results.length === 1 && results[0].raw) {
                openDoubanDetailDialog(results[0]);
            }
        } catch (error: any) {
            results = [];
            statusText = error?.message || "搜索失败";
            showMessage(statusText);
        } finally {
            isSearching = false;
        }
    }

    function openDoubanDetailDialog(result: WorkbenchSearchResult) {
        if (!result || !result.raw) return;
        selectedResult = result;
        isDoubanDetailOpen = true;
        statusText = "已打开豆瓣图书详情，请确认修改后添加";

        loadDoubanBookPreferences(plugin).then((preferences) => {
            const bookRaw = result.raw as any;
            const bookInfo = {
                ...bookRaw,
                addNotes: bookRaw.addNotes ?? true,
            };

            const dialogRef = svelteDialog({
                title: `确认添加：${bookInfo.title || "豆瓣图书"}`,
                width: "min(780px, 94vw)",
                height: "min(780px, 88vh)",
                constructor: (container: HTMLElement) =>
                    new DoubanBookDetailDialog({
                        target: container,
                        props: {
                            bookInfo,
                            customRatings: preferences.ratings,
                            customCategories: preferences.categories,
                            customReadingStatuses: preferences.statuses,
                            close: () => dialogRef.close(),
                        },
                    }),
                callback: () => {
                    isDoubanDetailOpen = false;
                    results = [];
                    selectedResult = null;
                },
            });

            dialogRef.component.$on("confirm", async (event: CustomEvent<any>) => {
                const editedBookInfo = event.detail;
                try {
                    const saveResult = await addEditedDoubanBookToDatabase(plugin, editedBookInfo);
                    showMessage(saveResult?.msg || (saveResult?.code === 0 ? "书籍添加成功" : "书籍添加失败"));
                    if (saveResult?.code === 0) {
                        results = [];
                        selectedResult = null;
                        isDoubanDetailOpen = false;
                        statusText = "书籍添加成功";
                        dispatch("refresh");
                        dialogRef.close();
                    }
                } catch (e) {
                    showMessage(`添加失败：${e?.message || "未知错误"}`);
                }
            });
        });
    }

    function chooseResult(result: WorkbenchSearchResult) {
        selectedResult = result;
        if (result.raw) {
            openDoubanDetailDialog(result);
        }
    }
</script>

<section class="workbench-search">
    <div class="workbench-search-head">
        <div>
            <h2>豆瓣读书书籍搜索导入</h2>
            <p>从豆瓣读书搜索书籍，确认详情后导入本地阅读数据库。</p>
        </div>
    </div>

    <div class="workbench-search-bar">
        <div
            class="workbench-search-input-wrap"
            tabindex="0"
            role="button"
            on:click={() => searchInput?.focus()}
            on:keydown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    searchInput?.focus();
                }
            }}
        >
            <SiYuanIcon name="search" size={16} />
            <input
                class="b3-text-field"
                bind:this={searchInput}
                bind:value={query}
                placeholder="搜索书名、ISBN 或作者"
                on:keydown={(event) => event.key === "Enter" && runSearch()}
                on:click|stopPropagation
                on:mousedown|stopPropagation
            />
        </div>
        <button class="workbench-button workbench-button-primary" on:click={runSearch} disabled={isSearching}>
            <SiYuanIcon name="search" size={15} />
            <span>{isSearching ? "搜索中" : "搜索"}</span>
        </button>
    </div>

    <div class="workbench-search-status">
        <span>{statusText}</span>
    </div>

    {#if results.length > 0 && !isDoubanDetailOpen}
        <div class="workbench-search-results">
            {#each results as result (result.id)}
                <button
                    class:active={selectedResult?.id === result.id}
                    class="workbench-search-result"
                    on:click={() => chooseResult(result)}
                >
                    {#if result.cover}
                        <img src={result.cover} alt="" />
                    {:else}
                        <span class="workbench-search-result-placeholder"><SiYuanIcon name="book" size={18} /></span>
                    {/if}
                    <span class="workbench-search-result-main">
                        <strong>{result.title}</strong>
                        <em>{result.author || result.isbn || result.description || "暂无摘要"}</em>
                    </span>
                    <span class="workbench-search-result-source">豆瓣图书</span>
                </button>
            {/each}
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
    }

    .workbench-search-input-wrap input {
        flex: 1;
        width: 100%;
        height: 100%;
        min-width: 0;
        border: 0;
        background: transparent;
        box-shadow: none;
        pointer-events: auto;
        user-select: text;
        cursor: text;
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

    .workbench-search-result-source {
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
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
</style>