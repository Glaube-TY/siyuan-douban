<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { showMessage } from "siyuan";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import DoubanBookDetailDialog from "../bookSearch/DoubanBookDetailDialog.svelte";
    import type { WorkbenchAction, WorkbenchSearchResult, WorkbenchSearchSource } from "../../types/workbench";
    import { addEditedDoubanBookToDatabase, loadDoubanBookPreferences, searchDoubanBook } from "../../utils/bookSearch/doubanSearchService";
    import { openLocalBookResult, searchLocalBooks } from "../../utils/bookSearch/localBookSearchService";
    import { openWereadCachedNotebooks, searchWereadCachedBooks } from "../../utils/bookSearch/wereadBookSearchService";
    import { svelteDialog } from "../../libs/dialog";

    export let plugin: any;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction; refresh: void }>();

    let query = "";
    let searchInput: HTMLInputElement;
    let source: WorkbenchSearchSource = "local";
    let results: WorkbenchSearchResult[] = [];
    let selectedResult: WorkbenchSearchResult | null = null;
    let statusText = "选择来源后搜索书名、ISBN、作者或微信读书书籍";
    let isSearching = false;
    let isDoubanDetailOpen = false;

    const sources: Array<{ key: WorkbenchSearchSource; label: string; icon: string }> = [
        { key: "local", label: "本地书籍", icon: "localShelf" },
        { key: "douban", label: "豆瓣图书", icon: "douban" },
        { key: "weread", label: "微信读书", icon: "weread" },
    ];

    const sourceLabels: Record<string, string> = {
        local: "本地",
        douban: "豆瓣图书",
        weread: "微信读书",
    };

    async function runSearch() {
        isSearching = true;
        selectedResult = null;
        try {
            if (source === "local") {
                results = await searchLocalBooks(plugin, query);
            } else if (source === "douban") {
                results = await searchDoubanBook(plugin, query);
            } else {
                results = await searchWereadCachedBooks(plugin, query);
            }
            statusText = results.length ? `找到 ${results.length} 条结果` : "暂无匹配结果";
            if (source === "douban" && results.length === 1 && results[0].raw) {
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
        if (!result || result.source !== "douban" || !result.raw) return;
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
        if (result.source === "douban" && result.raw) {
            openDoubanDetailDialog(result);
        } else if (result.source === "local") {
            openLocalBookResult(plugin, result);
        } else if (result.source === "weread") {
            if (result.noteDocId) {
                showMessage("已找到本地笔记，请在有笔记书籍列表中查看详情");
            } else {
                showMessage("微信读书结果来自本地缓存，可从有笔记书籍入口查看");
            }
        }
    }

    async function openWereadCache() {
        await openWereadCachedNotebooks(plugin);
    }
</script>

<section class="workbench-search">
    <div class="workbench-search-head">
        <div>
            <h2>统一搜索</h2>
            <p>从本地数据库、豆瓣图书和微信读书缓存进入常用书籍操作。</p>
        </div>
        <div class="workbench-search-source" role="tablist">
            {#each sources as item (item.key)}
                <button class:active={source === item.key} on:click={() => (source = item.key)}>
                    <SiYuanIcon name={item.icon} pluginName={plugin.name} size={15} />
                    <span>{item.label}</span>
                </button>
            {/each}
        </div>
    </div>

    <div class="workbench-search-bar">
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="workbench-search-input-wrap" on:click={() => searchInput?.focus()}>
            <SiYuanIcon name="search" size={16} />
            <input
                class="b3-text-field"
                bind:this={searchInput}
                bind:value={query}
                placeholder="搜索书名、ISBN、作者或微信读书书籍"
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
        {#if source === "weread"}
            <button on:click={openWereadCache}>打开有笔记书籍</button>
            <button on:click={() => dispatch("action", "sync-weread")}>进入同步面板</button>
        {/if}
    </div>

    {#if results.length > 0 && !(source === "douban" && isDoubanDetailOpen)}
        <div class="workbench-search-results">
            {#each results as result (result.id)}
                <button
                    class:active={selectedResult?.id === result.id && selectedResult?.source === result.source}
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
                    <span class="workbench-search-result-source">{sourceLabels[result.source] || result.source}</span>
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

    .workbench-search-source {
        display: inline-flex;
        gap: 4px;
        padding: 4px;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
    }

    .workbench-search-source button,
    .workbench-search-status button,
    .workbench-button {
        border: 1px solid transparent;
        border-radius: 7px;
        cursor: pointer;
        transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
    }

    .workbench-search-source button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 30px;
        padding: 0 10px;
        background: transparent;
        color: var(--b3-theme-on-background);
        font-size: 12px;
        font-weight: 600;
    }

    .workbench-search-source button.active {
        background: var(--b3-theme-surface);
        border-color: var(--b3-border-color);
        color: var(--b3-theme-primary);
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
        min-width: 0;
        padding: 0 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        cursor: text;
    }

    .workbench-search-input-wrap input {
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
        border-color: var(--b3-border-color);
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        font-size: 13px;
        font-weight: 600;
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

    .workbench-search-status button {
        height: 26px;
        padding: 0 9px;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
        color: var(--b3-theme-primary);
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

        .workbench-search-source {
            justify-self: start;
            flex-wrap: wrap;
        }
    }

    @media (max-width: 720px) {
        .workbench-search-results {
            grid-template-columns: 1fr;
        }
    }
</style>
