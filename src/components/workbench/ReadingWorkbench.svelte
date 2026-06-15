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
    import { loadLocalBookSearchState } from "../../utils/bookSearch/localBookSearchService";
    import { getWereadCacheSummary } from "../../utils/bookSearch/wereadBookSearchService";
    import { loadBookPreferenceSettings } from "../../utils/settings/bookPreferenceSettingsService";
    import { loadTemplateSettings } from "../../utils/settings/templateSettingsService";
    import { loadWereadAuthState, loadWereadSyncOptions } from "../../utils/settings/wereadSettingsService";
    import { getLatestWereadSyncReport } from "../../utils/storage/syncReportStorage";

    export let plugin: any;
    export let refreshKey = 0;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction; refresh: void }>();

    let localSummary: WorkbenchLocalAssetSummary | null = null;
    let wereadSummary: WorkbenchWereadAssetSummary | null = null;
    let isLoading = true;
    let lastRefreshKey = refreshKey;

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
            };
        } finally {
            isLoading = false;
        }
    }

    function action(event: CustomEvent<WorkbenchAction>) {
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
    <WorkbenchSearch {plugin} on:action={action} on:refresh={refresh} />

    <div class="workbench-assets-grid">
        <WorkbenchLocalAssets summary={localSummary} on:action={action} />
        <WorkbenchWereadAssets summary={wereadSummary} pluginName={plugin.name} on:action={action} />
    </div>

    <div class="workbench-operations-grid">
        <WorkbenchRecentNotes {plugin} {refreshKey} on:action={action} />
        <WorkbenchReviewPanel {plugin} {refreshKey} on:action={action} />
    </div>

    <WorkbenchShelfHub {plugin} {refreshKey} />
</div>

<style>
    .workbench-root {
        display: grid;
        gap: clamp(14px, 1.7vw, 20px);
    }

    .workbench-root-loading {
        cursor: progress;
    }

    .workbench-assets-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: clamp(14px, 1.7vw, 20px);
    }

    .workbench-operations-grid {
        display: grid;
        grid-template-columns: minmax(320px, 0.8fr) minmax(0, 1.2fr);
        gap: clamp(14px, 1.7vw, 20px);
    }

    @media (max-width: 980px) {
        .workbench-assets-grid,
        .workbench-operations-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
