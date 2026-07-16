<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import type { I18N } from "siyuan";
    import { svelteDialog } from "../../libs/dialog";
    import type { ReadingCenterOverview } from "../../types/readingCenter";
    import type { WorkbenchAction } from "../../types/workbench";
    import type { ReadingInboxItem } from "../../types/readingInbox";
    import { getReadingCenterOverview } from "../../utils/readingCenter/readingCenterData";
    import { loadDatabaseSettings } from "../../utils/settings/databaseSettingsService";
    import { openLocalBookShelf } from "../../utils/bookSearch/localBookSearchService";
    import { openWereadCachedNotebooks } from "../../utils/bookSearch/wereadBookSearchService";
    import { runWorkbenchManualWereadApiSync } from "../../utils/weread/api/workbenchManualSyncWereadApi";
    import type { WereadSyncProgressEvent, WereadSyncPlanConfirmPayload } from "../../utils/weread/api/wereadSyncProgress";
    import WereadSyncPlanConfirmDialog from "../common/WereadSyncPlanConfirmDialog.svelte";
    import WereadSyncProgressDialog from "../common/WereadSyncProgressDialog.svelte";
    import ReadingWorkbench from "../workbench/ReadingWorkbench.svelte";
    import ReadingFeatureShell from "./ReadingFeatureShell.svelte";
    import SyncResultCenter from "../readingManagement/SyncResultCenter.svelte";
    import ReadingBookStatusManager from "./ReadingBookStatusManager.svelte";
    import ReadingTopics from "./ReadingTopics.svelte";
    import ReadingReview from "./ReadingReview.svelte";
    import ReadingDigestReports from "./ReadingDigestReports.svelte";
    import ReadingStatsCenter from "./ReadingStatsCenter.svelte";
    import WereadTab from "../tabs/WereadTab.svelte";
    import DatabaseSettingsDialog from "../settings/DatabaseSettingsDialog.svelte";
    import BookPreferenceSettingsDialog from "../settings/BookPreferenceSettingsDialog.svelte";
    import TemplateSettingsDialog from "../settings/TemplateSettingsDialog.svelte";
    import WereadApiKeyDialog from "../settings/WereadApiKeyDialog.svelte";
    import SyncOptionsDialog from "../settings/SyncOptionsDialog.svelte";
    import AboutPluginDialog from "../settings/AboutPluginDialog.svelte";
    import WereadBookManagementDialog from "../common/WereadBookManagementDialog.svelte";
    import { localizeKnownUiText, t } from "../../utils/i18n";

    export let i18n: I18N;
    export let plugin: any;
    export let mobile = false;
    export let onClose: () => void = () => {};

    type ReadingCenterView =
        | "dashboard"
        | "sync-panel"
        | "reading-stats"
        | "sync-result"
        | "book-status"
        | "topics"
        | "review"
        | "digest";

    let currentView: ReadingCenterView = "dashboard";
    let overviewData: ReadingCenterOverview | null = null;
    let isLoading = true;
    let pendingTopicItem: ReadingInboxItem | null = null;
    let databaseStatus: "success" | "error" | "" = "";
    let workbenchRefreshKey = 0;
    let isWorkbenchSyncing = false;
    let syncResultInitialView: "todo" | "records" = "todo";
    let syncResultFocus: "new" | "issues" | "diagnostics" | "changes" = "new";
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) => t(plugin, key, fallback, params);

    // 同步进度弹窗相关
    let progressDialogRef: WereadSyncProgressDialog | null = null;
    let progressDialogHandle: any = null;
    let syncProgressEvents: WereadSyncProgressEvent[] = [];

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

    function openSyncResult(
        view: "todo" | "records",
        focus: "new" | "issues" | "diagnostics" | "changes"
    ) {
        syncResultInitialView = view;
        syncResultFocus = focus;
        currentView = "sync-result";
    }

    function openComponentDialog(component: any, options: { title: string; width?: string; height?: string; props?: Record<string, any> }) {
        let dialogRef: any;
        dialogRef = svelteDialog({
            title: options.title,
            width: mobile ? "100vw" : (options.width || "620px"),
            height: mobile ? "100dvh" : options.height,
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
        if (mobile) {
            dialogRef.dialog.element.classList.add("siyuan-douban-mobile-subdialog");
        }
    }

    function openDatabaseSettings() {
        openComponentDialog(DatabaseSettingsDialog, { title: tx("centerDatabaseSettings", "本地数据库设置"), width: "min(560px, 92vw)" });
    }

    function openBookPreferences() {
        openComponentDialog(BookPreferenceSettingsDialog, { title: tx("centerBookPreferences", "书籍偏好设置"), width: "min(620px, 92vw)" });
    }

    function openTemplateSettings() {
        openComponentDialog(TemplateSettingsDialog, { title: tx("centerTemplateSettings", "模板设置"), width: "min(760px, 92vw)", height: "min(680px, 86vh)" });
    }

    function openWereadAuth() {
        openComponentDialog(WereadApiKeyDialog, { title: tx("centerWereadAuth", "微信读书授权"), width: "min(580px, 92vw)" });
    }

    function openSyncOptions() {
        openComponentDialog(SyncOptionsDialog, { title: tx("settingsSyncOptionsTitle", "同步选项"), width: "min(600px, 92vw)" });
    }

    function openAbout() {
        openComponentDialog(AboutPluginDialog, {
            title: tx("centerAbout", "关于插件"),
            width: "min(720px, 92vw)",
            height: "min(620px, 86vh)",
        });
    }

    // 同步进度回调
    function handleSyncProgress(event: WereadSyncProgressEvent) {
        const loggedEvent = { ...event, timestamp: event.timestamp || Date.now() };
        syncProgressEvents = [...syncProgressEvents.slice(-299), loggedEvent];
        if (progressDialogRef) {
            progressDialogRef.addEvent(loggedEvent);
        }
        // 对成功和失败的项目显示简短提示
        if (event.stage === "item_success") {
            showMessage(localizeKnownUiText(plugin, event.message), 3000);
        } else if (event.stage === "item_failed") {
            showMessage(localizeKnownUiText(plugin, event.message), 5000);
        }
    }

    // 同步计划确认回调
    function handleSyncPlanConfirm(payload: WereadSyncPlanConfirmPayload): Promise<boolean> {
        return new Promise((resolve) => {
            let dialogRef: any;
            dialogRef = svelteDialog({
                title: tx("centerSyncConfirm", "确认微信读书同步"),
                width: mobile ? "100vw" : "min(560px, 92vw)",
                height: mobile ? "100dvh" : "min(500px, 80vh)",
                disableClose: true,
                hideCloseIcon: true,
                constructor: (container: HTMLElement) => new WereadSyncPlanConfirmDialog({
                    target: container,
                    props: {
                        payload,
                        plugin,
                        onConfirm: () => {
                            dialogRef.close();
                            resolve(true);
                        },
                        onCancel: () => {
                            dialogRef.close();
                            resolve(false);
                        },
                    },
                }),
            });
            if (mobile) {
                dialogRef.dialog.element.classList.add("siyuan-douban-mobile-subdialog");
            }
        });
    }

    // 打开进度弹窗
    function openProgressDialog() {
        if (progressDialogHandle) return;

        let dialogRef: any;
        dialogRef = svelteDialog({
            title: tx("centerSyncProgress", "微信读书同步进度"),
            width: mobile ? "100vw" : "min(560px, 92vw)",
            height: mobile ? "100dvh" : "min(500px, 80vh)",
            disableClose: true,
            hideCloseIcon: true,
            constructor: (container: HTMLElement) => {
                const component = new WereadSyncProgressDialog({
                    target: container,
                    props: {
                        plugin,
                        onClose: () => {
                            dialogRef.close();
                        },
                    },
                });
                progressDialogRef = component;
                for (const progressEvent of syncProgressEvents) {
                    component.addEvent(progressEvent);
                }
                return component;
            },
            callback: () => {
                progressDialogRef = null;
                progressDialogHandle = null;
            },
        });
        progressDialogHandle = dialogRef;
        if (mobile) {
            dialogRef.dialog.element.classList.add("siyuan-douban-mobile-subdialog");
        }
    }

    async function handleWorkbenchAction(event: CustomEvent<WorkbenchAction>) {
        const action = event.detail;
        if (action === "sync-weread") {
            switchToView("sync-panel");
        } else if (action === "sync-weread-update") {
            if (isWorkbenchSyncing) {
                openProgressDialog();
                showMessage(tx("centerSyncStillRunning", "同步仍在进行，已重新打开进度窗口"));
                return;
            }
            isWorkbenchSyncing = true;
            syncProgressEvents = [];
            openProgressDialog();
            try {
                const result = await runWorkbenchManualWereadApiSync(plugin, "update", {
                    onProgress: handleSyncProgress,
                    confirmPlan: handleSyncPlanConfirm,
                });
                if (result.message) {
                    showMessage(localizeKnownUiText(plugin, result.message));
                } else if (result.totalPlanned > 0) {
                    showMessage(tx("centerUpdateFinished", "更新同步完成：成功 {success}，失败 {failed}，共 {total} 项", {
                        success: result.totalSuccess, failed: result.totalFailed, total: result.totalPlanned,
                    }));
                } else {
                    showMessage(tx("centerUpdateNoWork", "更新同步完成，无需处理的来源"));
                }
            } catch (e) {
                showMessage(tx("centerUpdateFailed", "更新同步失败：{error}", { error: e?.message || tx("uiUnknownError", "未知错误") }));
            } finally {
                isWorkbenchSyncing = false;
                await refreshAll();
            }
        } else if (action === "sync-weread-all") {
            if (isWorkbenchSyncing) {
                openProgressDialog();
                showMessage(tx("centerSyncStillRunning", "同步仍在进行，已重新打开进度窗口"));
                return;
            }
            isWorkbenchSyncing = true;
            syncProgressEvents = [];
            openProgressDialog();
            try {
                const result = await runWorkbenchManualWereadApiSync(plugin, "all", {
                    onProgress: handleSyncProgress,
                    confirmPlan: handleSyncPlanConfirm,
                });
                if (result.message) {
                    showMessage(localizeKnownUiText(plugin, result.message));
                } else if (result.totalPlanned > 0) {
                    showMessage(tx("centerFullFinished", "全部同步完成：成功 {success}，失败 {failed}，共 {total} 项", {
                        success: result.totalSuccess, failed: result.totalFailed, total: result.totalPlanned,
                    }));
                } else {
                    showMessage(tx("centerFullNoWork", "全部同步完成，无需处理的来源"));
                }
            } catch (e) {
                showMessage(tx("centerFullFailed", "全部同步失败：{error}", { error: e?.message || tx("uiUnknownError", "未知错误") }));
            } finally {
                isWorkbenchSyncing = false;
                await refreshAll();
            }
        } else if (action === "open-inbox") {
            openSyncResult("todo", "new");
        } else if (action === "open-sync-changes") {
            openSyncResult("records", "changes");
        } else if (action === "open-unbound-books") {
            openSyncResult("todo", "issues");
        } else if (action === "open-book-health") {
            openSyncResult("todo", "issues");
        } else if (action === "open-maintenance") {
            openSyncResult("records", "diagnostics");
        } else if (action === "open-diagnostics") {
            openSyncResult("todo", "issues");
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
            switchToView("reading-stats");
        } else if (action === "open-weread-book-management") {
            let dialogRef: any;
            dialogRef = svelteDialog({
                title: tx("centerBookManagement", "微信读书书籍管理"),
                width: "min(720px, 92vw)",
                height: "min(560px, 80vh)",
                constructor: (container: HTMLElement) => new WereadBookManagementDialog({
                    target: container,
                    props: {
                        plugin,
                        onConfirm: () => {
                            dialogRef.close();
                            refreshAll();
                        },
                        onCancel: () => {
                            dialogRef.close();
                        },
                    },
                }),
            });
        } else if (action === "add-book") {
            showMessage(tx("centerAddBookHint", "请在豆瓣读书搜索导入中搜索并添加书籍"));
        } else if (action === "search") {
            switchToDashboard();
        }
    }

    function handleAddInboxToTopic(event: CustomEvent) {
        pendingTopicItem = event.detail?.item || null;
        switchToView("topics");
    }

</script>

<div class="reading-center-container" class:reading-center-container-mobile={mobile}>
    {#if mobile}
        <header class="reading-center-mobile-header">
            <div><span>{tx("centerMobileTitle", "读书笔记")}</span><small>{currentView === "dashboard" ? tx("centerMobileWorkspace", "移动工作台") : tx("centerFeatureDetail", "功能详情")}</small></div>
            <button type="button" on:click={onClose} aria-label={tx("centerCloseLabel", "关闭读书笔记工作台")}>{tx("uiClose", "关闭")}</button>
        </header>
    {/if}
    <main
        class:reading-center-mobile-view={mobile}
        class:reading-center-mobile-dashboard-view={mobile && currentView === "dashboard"}
    >
      {#if currentView === "dashboard"}
        <div class="reading-center-dashboard">
            {#if isLoading && !overviewData}
                <div class="reading-center-loading">
                    <div class="reading-center-spinner"></div>
                    <p>{tx("centerLoadingWorkspace", "加载阅读工作台...")}</p>
                </div>
            {:else}
                <ReadingWorkbench
                    {plugin}
                    {mobile}
                    refreshKey={workbenchRefreshKey}
                    on:action={handleWorkbenchAction}
                    on:refresh={refreshAll}
                />
            {/if}
        </div>
    {:else if currentView === "sync-panel"}
        <ReadingFeatureShell
            {plugin}
            title={tx("centerSyncFeatureTitle", "微信读书同步")}
            subtitle={tx("centerSyncFeatureDesc", "沿用原同步主链路，在这里手动触发同步或更新缓存")}
            tabs={[]}
            activeTab=""
            on:back={switchToDashboard}
        >
            <div class="siyuan-douban-plugin reading-center-legacy-plugin">
                <WereadTab bind:plugin bind:i18n {databaseStatus} {mobile} />
            </div>
        </ReadingFeatureShell>
    {:else if currentView === "reading-stats"}
        <ReadingStatsCenter {plugin} on:back={switchToDashboard} on:action={handleWorkbenchAction} />
    {:else if currentView === "sync-result"}
        {#key `${syncResultInitialView}:${syncResultFocus}`}
            <SyncResultCenter
                {plugin}
                initialView={syncResultInitialView}
                focus={syncResultFocus}
                on:back={switchToDashboard}
                on:action={handleWorkbenchAction}
                on:addToTopic={handleAddInboxToTopic}
            />
        {/key}
    {:else if currentView === "book-status"}
        <ReadingBookStatusManager {plugin} on:back={switchToDashboard} />
    {:else if currentView === "topics"}
        <ReadingTopics {plugin} pendingInboxItem={pendingTopicItem} on:back={switchToDashboard} />
    {:else if currentView === "review"}
        <ReadingReview {plugin} on:back={switchToDashboard} />
    {:else if currentView === "digest"}
        <ReadingDigestReports {plugin} on:back={switchToDashboard} />
      {/if}
    </main>
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

    .reading-center-container-mobile {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        overflow: hidden;
        position: relative;
    }

    .reading-center-container-mobile .reading-center-dashboard {
        flex: 1 1 auto;
        min-height: 0;
        height: 100%;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 12px 12px 0;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
    }

    main:not(.reading-center-mobile-view) {
        display: contents;
    }

    .reading-center-mobile-view {
        flex: 1 1 auto;
        height: 0;
        min-height: 0;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
    }

    .reading-center-mobile-dashboard-view {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        touch-action: auto;
    }

    .reading-center-mobile-header {
        z-index: 25;
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 52px;
        padding: calc(8px + env(safe-area-inset-top)) 14px 8px;
        border-bottom: 1px solid var(--b3-border-color);
        background: color-mix(in srgb, var(--b3-theme-background) 94%, transparent);
        backdrop-filter: blur(16px);
    }

    .reading-center-mobile-header > div { display: grid; gap: 1px; }
    .reading-center-mobile-header span { font-size: 16px; font-weight: 700; }
    .reading-center-mobile-header small { color: var(--b3-theme-on-surface-light); font-size: 10px; }
    .reading-center-mobile-header button {
        min-width: 58px;
        min-height: 36px;
        border: 1px solid var(--b3-border-color);
        border-radius: 9px;
        background: var(--b3-theme-surface);
        color: var(--b3-theme-on-background);
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
        border: 3px solid var(--b3-border-color);
        border-top-color: var(--b3-theme-primary);
        border-radius: 50%;
        animation: reading-center-spin 1s linear infinite;
    }

    .reading-center-legacy-plugin {
        display: block;
        width: 100%;
        height: auto;
        min-height: 0;
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
