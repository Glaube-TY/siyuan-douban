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
    import WorkbenchRecentNotes from "./WorkbenchRecentNotes.svelte";
    import WorkbenchReviewPanel from "./WorkbenchReviewPanel.svelte";
    import WorkbenchShelfHub from "./WorkbenchShelfHub.svelte";
    import ReadingStatsCenter from "../readingCenter/ReadingStatsCenter.svelte";
    import { loadLocalBookSearchState } from "../../utils/bookSearch/localBookSearchService";
    import { getWereadCacheSummary } from "../../utils/bookSearch/wereadBookSearchService";
    import { loadBookPreferenceSettings } from "../../utils/settings/bookPreferenceSettingsService";
    import { loadTemplateSettings } from "../../utils/settings/templateSettingsService";
    import { loadWereadAuthState, loadWereadSyncOptions } from "../../utils/settings/wereadSettingsService";
    import { getLatestWereadSyncReport } from "../../utils/storage/syncReportStorage";

    export let plugin: any;
    export let refreshKey = 0;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction; refresh: void }>();

    type WorkbenchSection = "overview" | "shelf-hub" | "weread-stats";

    let localSummary: WorkbenchLocalAssetSummary | null = null;
    let wereadSummary: WorkbenchWereadAssetSummary | null = null;
    let isLoading = true;
    let lastRefreshKey = refreshKey;
    let activeSection: WorkbenchSection = "overview";

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
                    ? `成功 ${latestReport.successCount} / 失败 ${latestReport.failedCount} / 跳过 ${latestReport.skippedCount}`
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

    onMount(loadSummaries);

    $: if (refreshKey !== lastRefreshKey) {
        lastRefreshKey = refreshKey;
        loadSummaries();
    }
</script>

<div class="workbench-root" class:workbench-root-loading={isLoading}>
    <WorkbenchHero on:action={action} />

    <nav class="workbench-section-tabs" aria-label="阅读总控台导航">
        <button
            type="button"
            class:active={activeSection === "overview"}
            on:click={() => activeSection = "overview"}
        >
            <span>总控台</span>
            <em>检索、同步与整理</em>
        </button>
        <button
            type="button"
            class:active={activeSection === "shelf-hub"}
            on:click={() => activeSection = "shelf-hub"}
        >
            <span>书架中心</span>
            <em>书架资产与笔记入口</em>
        </button>
        <button
            type="button"
            class:active={activeSection === "weread-stats"}
            on:click={() => activeSection = "weread-stats"}
        >
            <span>微信读书数据</span>
            <em>阅读统计与同步覆盖</em>
        </button>
    </nav>

    {#if activeSection === "overview"}
        <WorkbenchSearch {plugin} on:action={action} on:refresh={refresh} />

        <div class="workbench-assets-grid">
            <WorkbenchLocalAssets summary={localSummary} on:action={action} />
            <WorkbenchWereadAssets summary={wereadSummary} pluginName={plugin.name} on:action={action} />
        </div>

        <div class="workbench-operations-grid">
            <WorkbenchRecentNotes {plugin} {refreshKey} on:action={action} on:refresh={refresh} />
            <WorkbenchReviewPanel {plugin} {refreshKey} on:action={action} />
        </div>

    {:else if activeSection === "shelf-hub"}
        <WorkbenchShelfHub {plugin} {refreshKey} />
    {:else if activeSection === "weread-stats"}
        <ReadingStatsCenter {plugin} {refreshKey} embedded={true} showBack={false} on:action={action} />
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
        grid-template-columns: minmax(560px, 1.25fr) minmax(360px, 0.75fr);
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
