<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import type { I18N } from "siyuan";
    import { svelteDialog } from "../../libs/dialog";
    import type { ReadingCenterOverview, FeatureTab } from "../../types/readingCenter";
    import type { WorkbenchAction } from "../../types/workbench";
    import type { ReadingInboxItem } from "../../types/readingInbox";
    import { getReadingCenterOverview } from "../../utils/readingCenter/readingCenterData";
    import { loadDatabaseSettings } from "../../utils/settings/databaseSettingsService";
    import { openLocalBookShelf } from "../../utils/bookSearch/localBookSearchService";
    import {
        openCachedReadingStats,
        openWereadCachedNotebooks,
    } from "../../utils/bookSearch/wereadBookSearchService";
    import { runWorkbenchManualWereadApiSync } from "../../utils/weread/api/workbenchManualSyncWereadApi";
    import ReadingWorkbench from "../workbench/ReadingWorkbench.svelte";
    import ReadingFeatureShell from "./ReadingFeatureShell.svelte";
    import SyncReportCenter from "../syncReport/SyncReportCenter.svelte";
    import ReadingInbox from "./ReadingInbox.svelte";
    import ReadingBookStatusManager from "./ReadingBookStatusManager.svelte";
    import ReadingTopics from "./ReadingTopics.svelte";
    import ReadingReview from "./ReadingReview.svelte";
    import ReadingDigestReports from "./ReadingDigestReports.svelte";
    import WereadTab from "../tabs/WereadTab.svelte";
    import OldSettingsPage from "../index.svelte";
    import DatabaseSettingsDialog from "../settings/DatabaseSettingsDialog.svelte";
    import BookPreferenceSettingsDialog from "../settings/BookPreferenceSettingsDialog.svelte";
    import TemplateSettingsDialog from "../settings/TemplateSettingsDialog.svelte";
    import WereadApiKeyDialog from "../settings/WereadApiKeyDialog.svelte";
    import SyncOptionsDialog from "../settings/SyncOptionsDialog.svelte";
    import AboutPluginDialog from "../settings/AboutPluginDialog.svelte";

    export let i18n: I18N;
    export let plugin: any;

    type ReadingCenterView =
        | "dashboard"
        | "sync-panel"
        | "legacy-settings"
        | "sync-report"
        | "inbox"
        | "book-status"
        | "topics"
        | "review"
        | "digest";

    let currentView: ReadingCenterView = "dashboard";
    let initialTabKey = "search";
    let overviewData: ReadingCenterOverview | null = null;
    let isLoading = true;
    let pendingTopicItem: ReadingInboxItem | null = null;
    let databaseStatus: "success" | "error" | "" = "";
    let workbenchRefreshKey = 0;
    let isWorkbenchSyncing = false;

    const legacyTabs: FeatureTab[] = [
        {
            key: "search",
            label: "书籍查询",
            description: "兼容旧版豆瓣搜索和本地书架",
            iconType: "siyuan",
            icon: "iconSearch",
        },
        {
            key: "settings",
            label: "用户设置",
            description: "旧版完整设置页",
            iconType: "siyuan",
            icon: "iconSettings",
        },
        {
            key: "weread",
            label: "微信读书",
            description: "旧版微信读书同步面板",
            iconType: "image",
            icon: `/plugins/${plugin.name}/asset/WeRead.png`,
        },
        {
            key: "about",
            label: "关于插件",
            description: "旧版关于页面",
            iconType: "siyuan",
            icon: "iconInfo",
        },
    ];

    onMount(async () => {
        await refreshAll();
    });

    async function refreshAll() {
        isLoading = true;
        try {
            const [overview, db] = await Promise.all([
                getReadingCenterOverview(plugin),
                loadDatabaseSettings(plugin),
            ]);
            overviewData = overview;
            databaseStatus = db.valid ? "success" : "error";
            workbenchRefreshKey += 1;
        } catch (error) {
            console.error("Failed to load reading center overview:", error);
            overviewData = null;
            databaseStatus = "error";
        } finally {
            isLoading = false;
        }
    }

    function switchToDashboard() {
        currentView = "dashboard";
        refreshAll();
    }

    function switchToView(view: ReadingCenterView) {
        currentView = view;
    }

    function switchToLegacy(tabKey: string) {
        initialTabKey = tabKey;
        currentView = "legacy-settings";
    }

    function handleLegacySwitchTab(event: CustomEvent) {
        initialTabKey = event.detail?.key || "search";
    }

    function getLegacyTitle(key: string) {
        return legacyTabs.find((item) => item.key === key)?.label || "旧版设置";
    }

    function getLegacySubtitle(key: string) {
        return legacyTabs.find((item) => item.key === key)?.description || "兼容入口";
    }

    function openComponentDialog(component: any, options: { title: string; width?: string; height?: string; props?: Record<string, any> }) {
        let dialogRef: any;
        dialogRef = svelteDialog({
            title: options.title,
            width: options.width || "620px",
            height: options.height,
            constructor: (container: HTMLElement) => new component({
                target: container,
                props: {
                    plugin,
                    i18n,
                    ...(options.props || {}),
                    close: () => dialogRef?.close?.(),
                    onSaved: refreshAll,
                },
            }),
        });
    }

    function openDatabaseSettings() {
        openComponentDialog(DatabaseSettingsDialog, { title: "本地数据库设置", width: "min(560px, 92vw)" });
    }

    function openBookPreferences() {
        openComponentDialog(BookPreferenceSettingsDialog, { title: "书籍偏好设置", width: "min(620px, 92vw)" });
    }

    function openTemplateSettings() {
        openComponentDialog(TemplateSettingsDialog, { title: "模板设置", width: "min(760px, 92vw)", height: "min(680px, 86vh)" });
    }

    function openWereadAuth() {
        openComponentDialog(WereadApiKeyDialog, { title: "微信读书授权", width: "min(580px, 92vw)" });
    }

    function openSyncOptions() {
        openComponentDialog(SyncOptionsDialog, { title: "同步选项", width: "min(600px, 92vw)" });
    }

    function openAbout() {
        openComponentDialog(AboutPluginDialog, {
            title: "关于插件",
            width: "min(720px, 92vw)",
            height: "min(620px, 86vh)",
            props: { onOpenLegacy: () => switchToLegacy("settings") },
        });
    }

    async function handleWorkbenchAction(event: CustomEvent<WorkbenchAction>) {
        const action = event.detail;
        if (action === "sync-weread") {
            switchToView("sync-panel");
        } else if (action === "sync-weread-update") {
            if (isWorkbenchSyncing) {
                showMessage("同步正在进行中，请稍候...");
                return;
            }
            isWorkbenchSyncing = true;
            showMessage("正在执行微信读书更新同步...");
            try {
                const result = await runWorkbenchManualWereadApiSync(plugin, "update");
                if (result.message) {
                    showMessage(result.message);
                } else if (result.totalPlanned > 0) {
                    showMessage(`更新同步完成：成功 ${result.totalSuccess}，失败 ${result.totalFailed}，共 ${result.totalPlanned} 项`);
                } else {
                    showMessage("更新同步完成，无需处理的来源");
                }
            } catch (e) {
                showMessage(`更新同步失败：${e?.message || "未知错误"}`);
            } finally {
                isWorkbenchSyncing = false;
                await refreshAll();
            }
        } else if (action === "sync-weread-all") {
            if (isWorkbenchSyncing) {
                showMessage("同步正在进行中，请稍候...");
                return;
            }
            isWorkbenchSyncing = true;
            showMessage("正在执行微信读书全部同步...");
            try {
                const result = await runWorkbenchManualWereadApiSync(plugin, "all");
                if (result.message) {
                    showMessage(result.message);
                } else if (result.totalPlanned > 0) {
                    showMessage(`全部同步完成：成功 ${result.totalSuccess}，失败 ${result.totalFailed}，共 ${result.totalPlanned} 项`);
                } else {
                    showMessage("全部同步完成，无需处理的来源");
                }
            } catch (e) {
                showMessage(`全部同步失败：${e?.message || "未知错误"}`);
            } finally {
                isWorkbenchSyncing = false;
                await refreshAll();
            }
        } else if (action === "open-inbox") {
            switchToView("inbox");
        } else if (action === "open-diagnostics") {
            switchToView("sync-report");
        } else if (action === "open-database-settings") {
            openDatabaseSettings();
        } else if (action === "open-book-preferences") {
            openBookPreferences();
        } else if (action === "open-template-settings") {
            openTemplateSettings();
        } else if (action === "open-weread-auth") {
            openWereadAuth();
        } else if (action === "open-sync-options") {
            openSyncOptions();
        } else if (action === "open-about") {
            openAbout();
        } else if (action === "open-legacy-settings") {
            switchToLegacy("settings");
        } else if (action === "open-book-status") {
            switchToView("book-status");
        } else if (action === "open-review") {
            switchToView("review");
        } else if (action === "open-topics") {
            switchToView("topics");
        } else if (action === "open-digest") {
            switchToView("digest");
        } else if (action === "open-local-shelf") {
            await openLocalBookShelf(plugin);
        } else if (action === "open-weread-notebooks") {
            await openWereadCachedNotebooks(plugin);
        } else if (action === "open-reading-stats") {
            await openCachedReadingStats(plugin);
        } else if (action === "add-book") {
            showMessage("请在统一搜索中切换到豆瓣图书，搜索后添加书籍");
        } else if (action === "search") {
            switchToDashboard();
        }
    }

    function handleAddInboxToTopic(event: CustomEvent) {
        pendingTopicItem = event.detail?.item || null;
        switchToView("topics");
    }

    function handleRetryFailed() {
        showMessage("已切换到微信读书同步面板，请重新执行更新同步。");
        switchToView("sync-panel");
    }
</script>

<div class="reading-center-container">
    {#if currentView === "dashboard"}
        <div class="reading-center-dashboard">
            {#if isLoading && !overviewData}
                <div class="reading-center-loading">
                    <div class="reading-center-spinner"></div>
                    <p>加载阅读工作台...</p>
                </div>
            {:else}
                <ReadingWorkbench
                    {plugin}
                    refreshKey={workbenchRefreshKey}
                    on:action={handleWorkbenchAction}
                    on:refresh={refreshAll}
                />
            {/if}
        </div>
    {:else if currentView === "sync-panel"}
        <ReadingFeatureShell
            title="微信读书同步"
            subtitle="沿用原同步主链路，在这里手动触发同步或更新缓存"
            tabs={[]}
            activeTab=""
            on:back={switchToDashboard}
        >
            <WereadTab bind:plugin bind:i18n {databaseStatus} />
        </ReadingFeatureShell>
    {:else if currentView === "legacy-settings"}
        <ReadingFeatureShell
            title={getLegacyTitle(initialTabKey)}
            subtitle={getLegacySubtitle(initialTabKey)}
            tabs={legacyTabs}
            activeTab={initialTabKey}
            on:back={switchToDashboard}
            on:switchTab={handleLegacySwitchTab}
        >
            {#key initialTabKey}
                <OldSettingsPage {i18n} {plugin} {initialTabKey} embeddedMode={true} hideSidebar={true} />
            {/key}
        </ReadingFeatureShell>
    {:else if currentView === "sync-report"}
        <SyncReportCenter {plugin} on:back={switchToDashboard} on:retryFailed={handleRetryFailed} />
    {:else if currentView === "inbox"}
        <ReadingInbox {plugin} on:back={switchToDashboard} on:addToTopic={handleAddInboxToTopic} />
    {:else if currentView === "book-status"}
        <ReadingBookStatusManager {plugin} on:back={switchToDashboard} />
    {:else if currentView === "topics"}
        <ReadingTopics {plugin} pendingInboxItem={pendingTopicItem} on:back={switchToDashboard} />
    {:else if currentView === "review"}
        <ReadingReview {plugin} on:back={switchToDashboard} />
    {:else if currentView === "digest"}
        <ReadingDigestReports {plugin} on:back={switchToDashboard} />
    {/if}
</div>

<style>
    .reading-center-container {
        height: 100%;
        overflow: auto;
        background:
            linear-gradient(180deg, var(--b3-theme-background) 0%, color-mix(in srgb, var(--b3-theme-background) 94%, var(--b3-theme-primary)) 100%);
        color: var(--b3-theme-on-background);
    }

    .reading-center-dashboard {
        width: 100%;
        max-width: 1380px;
        margin: 0 auto;
        padding: clamp(14px, 2vw, 26px);
        box-sizing: border-box;
    }

    @media (min-width: 1600px) {
        .reading-center-dashboard {
            max-width: 1480px;
        }
    }

    .reading-center-loading {
        display: grid;
        place-items: center;
        gap: 12px;
        min-height: 360px;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
    }

    .reading-center-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--b3-theme-border);
        border-top-color: var(--b3-theme-primary);
        border-radius: 50%;
        animation: reading-center-spin 1s linear infinite;
    }

    @keyframes reading-center-spin {
        to {
            transform: rotate(360deg);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .reading-center-spinner {
            animation: none;
        }
    }
</style>
