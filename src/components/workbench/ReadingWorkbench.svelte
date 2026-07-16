<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import type {
        WorkbenchAction,
        WorkbenchLocalAssetSummary,
        WorkbenchWereadAssetSummary,
    } from "../../types/workbench";
    import WorkbenchHero from "./WorkbenchHero.svelte";
    import WorkbenchSearch from "./WorkbenchSearch.svelte";
    import WorkbenchLocalAssets from "./WorkbenchLocalAssets.svelte";
    import WorkbenchWereadAssets from "./WorkbenchWereadAssets.svelte";
    import WorkbenchReviewPanel from "./WorkbenchReviewPanel.svelte";
    import WorkbenchShelfHub from "./WorkbenchShelfHub.svelte";
    import ReadingStatsCenter from "../readingCenter/ReadingStatsCenter.svelte";
    import { loadLocalBookSearchState } from "../../utils/bookSearch/localBookSearchService";
    import { getWereadCacheSummary } from "../../utils/bookSearch/wereadBookSearchService";
    import { loadBookPreferenceSettings } from "../../utils/settings/bookPreferenceSettingsService";
    import { loadTemplateSettings } from "../../utils/settings/templateSettingsService";
    import { loadWereadAuthState, loadWereadSyncOptions } from "../../utils/settings/wereadSettingsService";
    import { getLatestWereadSyncReport } from "../../utils/storage/syncReportStorage";
    import { t } from "../../utils/i18n";

    export let plugin: any;
    export let refreshKey = 0;
    export let mobile = false;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction; refresh: void }>();

    type WorkbenchSection = "overview" | "shelf-hub" | "weread-stats";

    let localSummary: WorkbenchLocalAssetSummary | null = null;
    let wereadSummary: WorkbenchWereadAssetSummary | null = null;
    let isLoading = true;
    let lastRefreshKey = refreshKey;
    let activeSection: WorkbenchSection = "overview";
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);

    async function loadSummaries() {
        isLoading = true;
        try {
            const [localState, preferences, templates, auth, syncOptions, wereadCache, latestReport] = await Promise.all([
                loadLocalBookSearchState(plugin),
                loadBookPreferenceSettings(plugin),
                loadTemplateSettings(plugin),
                loadWereadAuthState(plugin),
                loadWereadSyncOptions(plugin),
                getWereadCacheSummary(plugin),
                getLatestWereadSyncReport(plugin),
            ]);

            localSummary = {
                databaseStatus: localState.databaseStatus,
                localBookCount: localState.databaseStatus.valid ? localState.books.length : null,
                bookTemplateConfigured: !!templates.noteTemplate.trim(),
                addNotes: templates.addNotes,
                isSYTemplateRender: templates.isSYTemplateRender,
                ratingsCount: preferences.ratings.length,
                categoriesCount: preferences.categories.length,
                statusesCount: preferences.statuses.length,
            };

            wereadSummary = {
                authConfigured: !!auth.apiKey,
                authVerified: auth.verified,
                apiKeyMasked: auth.maskedApiKey,
                verifiedAt: auth.verifiedAt,
                lastError: auth.lastError,
                notebookCount: wereadCache.notebookCount,
                noteCount: wereadCache.noteCount,
                shelfBookCount: wereadCache.shelfBookCount,
                hasNotebookCache: wereadCache.hasNotebookCache,
                hasReadingStatsCache: wereadCache.hasReadingStatsCache,
                readingStatsLoadedAt: wereadCache.readingStatsLoadedAt,
                lastSyncStatus: latestReport?.status || "unknown",
                lastSyncTime: latestReport?.endedAt || latestReport?.startedAt,
                lastSyncMessage: latestReport
                    ? tx("workbenchSyncSummary", "成功 {success} / 失败 {failed} / 跳过 {skipped}", {
                        success: latestReport.successCount,
                        failed: latestReport.failedCount,
                        skipped: latestReport.skippedCount,
                    })
                    : "",
                autoSync: syncOptions.autoSync,
                skipNewBookCheck: syncOptions.skipNewBookCheck,
                wereadBookTemplateConfigured: !!templates.wereadTemplates.trim(),
                wereadMpTemplateConfigured: !!templates.wereadMpTemplates.trim(),
                wereadTemplatesConfigured: !!templates.wereadTemplates.trim() && !!templates.wereadMpTemplates.trim(),
            };
        } finally {
            isLoading = false;
        }
    }

    function action(event: CustomEvent<WorkbenchAction>) {
        if (event.detail === "open-reading-stats") {
            activeSection = "weread-stats";
            return;
        }
        dispatch("action", event.detail);
    }

    function refresh() {
        loadSummaries();
        dispatch("refresh");
    }

    function triggerAction(actionType: WorkbenchAction) {
        dispatch("action", actionType);
    }

    onMount(loadSummaries);

    $: if (refreshKey !== lastRefreshKey) {
        lastRefreshKey = refreshKey;
        loadSummaries();
    }
</script>

<div class="workbench-root" class:workbench-root-loading={isLoading} class:workbench-root-mobile={mobile}>
    {#if mobile}
        <div class="mobile-workbench-content">
            {#if activeSection === "overview"}
                <section class="mobile-workbench-intro">
                    <span>{tx("workbenchReadingHub", "个人阅读中枢")}</span>
                    <strong>{tx("workbenchTodayPrompt", "今天想读点什么？")}</strong>
                    <small>{tx("workbenchMobileHint", "搜索书籍，或展开下方分组继续操作。")}</small>
                </section>

                <WorkbenchSearch {plugin} {mobile} on:action={action} on:refresh={refresh} />

                <div class="mobile-workbench-groups">
                    <details open>
                        <summary><span><strong>{tx("workbenchLocalReading", "本地阅读")}</strong><small>{tx("workbenchLocalReadingDesc", "数据库、模板与书架")}</small></span><em>{tx("workbenchExpand", "展开")}</em></summary>
                        <div class="mobile-group-content"><WorkbenchLocalAssets {plugin} summary={localSummary} on:action={action} /></div>
                    </details>
                    <details>
                        <summary><span><strong>{tx("workbenchWeread", "微信读书")}</strong><small>{tx("workbenchWereadDesc", "授权、同步与缓存")}</small></span><em>{tx("workbenchExpand", "展开")}</em></summary>
                        <div class="mobile-group-content"><WorkbenchWereadAssets {plugin} summary={wereadSummary} pluginName={plugin.name} on:action={action} /></div>
                    </details>
                    <details>
                        <summary><span><strong>{tx("workbenchSyncTodo", "同步结果与待办")}</strong><small>{tx("workbenchSyncTodoDesc", "新增内容、问题与同步记录")}</small></span><em>{tx("workbenchExpand", "展开")}</em></summary>
                        <div class="mobile-group-content">
                            <WorkbenchReviewPanel {plugin} {refreshKey} on:action={action} />
                        </div>
                    </details>
                </div>
            {:else if activeSection === "shelf-hub"}
                <WorkbenchShelfHub {plugin} {refreshKey} />
            {:else}
                <ReadingStatsCenter {plugin} {refreshKey} embedded={true} showBack={false} on:action={action} />
            {/if}
        </div>

        <nav class="mobile-workbench-nav" aria-label={tx("workbenchNavLabel", "移动端阅读工作台导航")}>
            <button type="button" class:active={activeSection === "overview"} on:click={() => activeSection = "overview"}><span>⌂</span><em>{tx("workbenchNavHome", "工作台")}</em></button>
            <button type="button" class:active={activeSection === "shelf-hub"} on:click={() => activeSection = "shelf-hub"}><span>▤</span><em>{tx("workbenchNavShelf", "书架")}</em></button>
            <button type="button" class:active={activeSection === "weread-stats"} on:click={() => activeSection = "weread-stats"}><span>◫</span><em>{tx("workbenchNavData", "数据")}</em></button>
            <button type="button" on:click={() => triggerAction("open-about")}><span>ⓘ</span><em>{tx("workbenchNavAbout", "关于")}</em></button>
        </nav>
    {:else}
        <WorkbenchHero {plugin} on:action={action} />

        <nav class="workbench-section-tabs" aria-label={tx("workbenchDesktopNavLabel", "阅读总控台导航")}>
            <button type="button" class:active={activeSection === "overview"} on:click={() => activeSection = "overview"}><span>{tx("workbenchOverview", "总控台")}</span><em>{tx("workbenchOverviewDesc", "检索、同步与整理")}</em></button>
            <button type="button" class:active={activeSection === "shelf-hub"} on:click={() => activeSection = "shelf-hub"}><span>{tx("workbenchShelfCenter", "书架中心")}</span><em>{tx("workbenchShelfCenterDesc", "书架资产与笔记入口")}</em></button>
            <button type="button" class:active={activeSection === "weread-stats"} on:click={() => activeSection = "weread-stats"}><span>{tx("workbenchWereadData", "微信读书数据")}</span><em>{tx("workbenchWereadDataDesc", "阅读统计与同步覆盖")}</em></button>
        </nav>

        {#if activeSection === "overview"}
            <WorkbenchSearch {plugin} on:action={action} on:refresh={refresh} />
            <div class="workbench-assets-grid">
                <WorkbenchLocalAssets {plugin} summary={localSummary} on:action={action} />
                <WorkbenchWereadAssets {plugin} summary={wereadSummary} pluginName={plugin.name} on:action={action} />
            </div>
            <div class="workbench-operations-grid">
                <WorkbenchReviewPanel {plugin} {refreshKey} on:action={action} />
            </div>
        {:else if activeSection === "shelf-hub"}
            <WorkbenchShelfHub {plugin} {refreshKey} />
        {:else if activeSection === "weread-stats"}
            <ReadingStatsCenter {plugin} {refreshKey} embedded={true} showBack={false} on:action={action} />
        {/if}
    {/if}
</div>

<style>
    .workbench-root {
        display: grid;
        gap: clamp(14px, 1.7vw, 20px);
    }

    .workbench-root-loading {
        cursor: progress;
    }

    .workbench-root-mobile {
        display: block;
        min-height: 100%;
        padding-bottom: calc(70px + env(safe-area-inset-bottom));
    }

    .mobile-workbench-content {
        display: grid;
        gap: 12px;
    }

    .mobile-workbench-intro {
        display: grid;
        gap: 4px;
        padding: 4px 2px 2px;
    }

    .mobile-workbench-intro span { color: var(--b3-theme-primary); font-size: 11px; font-weight: 700; }
    .mobile-workbench-intro strong { font-size: 22px; line-height: 1.3; }
    .mobile-workbench-intro small { color: var(--b3-theme-on-surface-light); font-size: 12px; }

    .mobile-workbench-groups {
        display: grid;
        gap: 10px;
    }

    .mobile-workbench-groups > details {
        overflow: hidden;
        border: 1px solid var(--b3-border-color);
        border-radius: 14px;
        background: var(--b3-theme-surface);
    }

    .mobile-workbench-groups summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px;
        list-style: none;
    }

    .mobile-workbench-groups summary::-webkit-details-marker { display: none; }
    .mobile-workbench-groups summary > span { display: grid; gap: 3px; }
    .mobile-workbench-groups summary strong { font-size: 14px; }
    .mobile-workbench-groups summary small,
    .mobile-workbench-groups summary em { color: var(--b3-theme-on-surface-light); font-size: 11px; font-style: normal; }
    .mobile-workbench-groups details[open] summary em { color: var(--b3-theme-primary); }

    .mobile-group-content {
        padding: 0 10px 10px;
    }

    .mobile-workbench-nav {
        position: fixed;
        z-index: 20;
        right: 0;
        bottom: 0;
        left: 0;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        padding: 7px 8px calc(7px + env(safe-area-inset-bottom));
        border-top: 1px solid var(--b3-border-color);
        background: color-mix(in srgb, var(--b3-theme-background) 92%, transparent);
        backdrop-filter: blur(16px);
    }

    .mobile-workbench-nav button {
        display: grid;
        place-items: center;
        gap: 3px;
        min-height: 48px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: var(--b3-theme-on-surface-light);
    }

    .mobile-workbench-nav button span { font-size: 18px; line-height: 1; }
    .mobile-workbench-nav button em { font-size: 10px; font-style: normal; }
    .mobile-workbench-nav button.active { background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent); color: var(--b3-theme-primary); }

    .workbench-section-tabs {
        display: flex;
        gap: 8px;
        max-width: 100%;
        padding: 6px;
        overflow-x: auto;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: color-mix(in srgb, var(--b3-theme-surface) 82%, var(--b3-theme-background));
        box-sizing: border-box;
    }

    .workbench-section-tabs button {
        display: grid;
        gap: 2px;
        min-width: 148px;
        padding: 10px 14px;
        border: 1px solid transparent;
        border-radius: 7px;
        background: transparent;
        color: var(--b3-theme-on-surface);
        cursor: pointer;
        font: inherit;
        text-align: left;
        white-space: nowrap;
    }

    .workbench-section-tabs button:hover {
        border-color: var(--b3-border-color);
        background: var(--b3-theme-background);
    }

    .workbench-section-tabs button.active {
        border-color: color-mix(in srgb, var(--b3-theme-primary) 42%, var(--b3-border-color));
        background: color-mix(in srgb, var(--b3-theme-primary-light) 36%, var(--b3-theme-background));
        color: var(--b3-theme-on-background);
    }

    .workbench-section-tabs span {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.25;
    }

    .workbench-section-tabs em {
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        font-style: normal;
        line-height: 1.3;
    }

    .workbench-assets-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: clamp(14px, 1.7vw, 20px);
    }

    .workbench-operations-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: clamp(10px, 1.3vw, 16px);
        align-items: stretch;
    }

    @media (max-width: 980px) {
        .workbench-assets-grid,
        .workbench-operations-grid {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 560px) {
        .workbench-section-tabs {
            flex-wrap: nowrap;
        }

        .workbench-section-tabs button {
            min-width: 132px;
            padding: 9px 11px;
        }
    }
</style>
