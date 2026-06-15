<script lang="ts">
    import { showMessage, I18N } from "siyuan";
    import { sql, getAttributeView, removeAttributeViewBlocks } from "@/api";
    import { onMount } from "svelte";
    import { svelteDialog } from "@/libs/dialog";
    import {
        createNotebooksDialog,
        createBookShelfDialog,
        createWereadNotesTemplateDialog,
        createWereadReadingStatsDialog,
    } from "@/utils/weread/wereadDialogs";
    import {
        loadPluginData,
        DEFAULT_WEREAD_SETTINGS,
        normalizeWereadPositionMark,
    } from "@/utils/core/configDefaults";
    import {
        loadWereadAuthState as loadWereadAuthStateFromService,
        verifyAndSaveWereadApiKey as verifyAndSaveWereadApiKeyFromService,
        clearWereadApiKey as clearWereadApiKeyFromService,
    } from "@/utils/settings/wereadSettingsService";
    import {
        maskWereadApiKey,
    } from "@/utils/weread/api/wereadApiAuth";
    import { syncWereadApiNormalBooks } from "@/utils/weread/api/syncWereadApiNormalBooks";
    import { syncWereadApiMpAccounts } from "@/utils/weread/api/syncWereadApiMpAccounts";
    import { ensureWereadApiModeState } from "@/utils/weread/api/wereadApiModeState";
    import { showWereadApiNewSourcesDialogAndSync } from "@/utils/weread/api/handleWereadApiNewSources";
    import { buildApiBookShelf } from "@/utils/weread/api/buildApiBookShelf";
    import { attachWereadApiLocalNoteDocs } from "@/utils/weread/api/findWereadApiBookTargetDoc";
    import { buildWereadApiNotebookCache } from "@/utils/weread/api/buildWereadApiNotebookCache";
    import { buildWereadApiReadingStats } from "@/utils/weread/api/buildWereadApiReadingStats";
    import { formatReadingDuration } from "@/utils/weread/api/formatWereadReadingStats";
    import { buildWereadSyncReport, saveWereadSyncReportAndApplyStatus } from "@/utils/storage/syncReportBuilder";
    import type { WereadReadingDashboard } from "@/utils/weread/api/buildWereadApiReadingStats";

    import wereadManageISBN from "@/components/common/wereadManageISBN.svelte";
    import wereadIgnoredBooksDialog from "@/components/common/wereadIgnoredBooksDialog.svelte";
    import wereadUseBookIDBooksDialog from "@/components/common/wereadUseBookIDBooksDialog.svelte";

    async function getCurrentValidBookIdentifiers(plugin: any): Promise<{ validISBNs: Set<string>, validBookIDs: Set<string>, validBookNames: Set<string> }> {
        const settings = await plugin.loadData("settings.json") || {};
        const blockID = settings?.bookDatabaseID || "";
        if (!blockID) return { validISBNs: new Set<string>(), validBookIDs: new Set<string>(), validBookNames: new Set<string>() };

        let avID = "";
        try {
            const blockResult = await sql(`SELECT * FROM blocks WHERE id = "${blockID}"`);
            avID = blockResult?.[0]?.markdown?.match(/data-av-id="([^"]+)"/)?.[1] || "";
        } catch {
            avID = "";
        }
        if (!avID) return { validISBNs: new Set<string>(), validBookIDs: new Set<string>(), validBookNames: new Set<string>() };

        try {
            let database = await getAttributeView(avID);
            let avData = database?.av || {};
            let keyValues: any[] = avData.keyValues || [];

            const isbnKey = keyValues.find((item: any) => item.key?.name === "ISBN");
            const bookIDKey = keyValues.find((item: any) => item.key?.name === "bookID");
            const bookNameKey = keyValues.find((item: any) => item.key?.name === "书名");

            let ISBNColumn = isbnKey?.values || [];
            let bookIDColumn = bookIDKey?.values || [];
            let bookNameColumn = bookNameKey?.values || [];

            const bookNameBlockIDs = new Set<string>(bookNameColumn.map((item: any) => item.blockID));
            const isbnBlockIDs = new Set<string>(ISBNColumn.map((item: any) => item.blockID));
            const bookIDBlockIDs = new Set<string>(bookIDColumn.map((item: any) => item.blockID));
            const blockIDsToRemove = Array.from(
                new Set<string>([
                    ...[...isbnBlockIDs].filter(id => !bookNameBlockIDs.has(id)),
                    ...[...bookIDBlockIDs].filter(id => !bookNameBlockIDs.has(id)),
                ])
            );

            if (blockIDsToRemove.length > 0) {
                await removeAttributeViewBlocks(avID, blockIDsToRemove);
                database = await getAttributeView(avID);
                avData = database?.av || {};
                keyValues = avData.keyValues || [];

                const updatedISBNKey = keyValues.find((item: any) => item.key?.name === "ISBN");
                const updatedBookIDKey = keyValues.find((item: any) => item.key?.name === "bookID");
                const updatedBookNameKey = keyValues.find((item: any) => item.key?.name === "书名");
                ISBNColumn = updatedISBNKey?.values || [];
                bookIDColumn = updatedBookIDKey?.values || [];
                bookNameColumn = updatedBookNameKey?.values || [];
            }

            const validISBNs = new Set<string>(
                ISBNColumn
                    .map((item: any) => item.number?.content?.toString())
                    .filter((v): v is string => !!v)
            );
            const validBookIDs = new Set<string>(
                bookIDColumn
                    .map((item: any) => item.text?.content?.toString())
                    .filter((v): v is string => !!v)
            );
            const validBookNames = new Set<string>(
                bookNameColumn
                    .map((item: any) => item.text?.content?.toString().trim())
                    .filter((v): v is string => !!v)
            );

            return { validISBNs, validBookIDs, validBookNames };
        } catch {
            return { validISBNs: new Set<string>(), validBookIDs: new Set<string>(), validBookNames: new Set<string>() };
        }
    }

    export let i18n: I18N;
    export let plugin: any;

    function i18nText(key: string, fallback = ""): string {
        const value = i18n?.[key];
        return typeof value === "string" ? value : fallback;
    }

    function i18nReplace(key: string, fallback: string, replacements: Record<string, string>): string {
        let text = i18nText(key, fallback);
        for (const [from, to] of Object.entries(replacements)) {
            text = text.replace(from, to);
        }
        return text;
    }

    export let wereadTemplates = "";
    export let wereadMpTemplates = "";
    export let wereadPositionMark = "";

    export let databaseStatus = "";

    let autoSync = false;
    let skipNewBookCheck = false;
    let isSyncing = false;

    let notebooksInfo = "";
    let notebooksList = [];
    let loadingBookShelf = false;

    let readingStats: WereadReadingDashboard | null = null;
    let isLoadingReadingStats = false;
    let readingStatsError = "";

    // 微信读书书籍列表预加载状态
    let isNotebookListLoading = false;
    let isNotebookListReady = false;

    // API Key 设置状态
    let wereadApiKeyInput = "";
    let wereadApiKeyVerified = false;
    let wereadApiKeyVerifiedAt = 0;
    let wereadApiKeyLastError = "";
    let isVerifyingWereadApiKey = false;

    let isPreparingWereadApiSync = false;
    let wereadApiSyncPreparingMessage = "";

    let wereadApiModeState: any = null;

    async function runWereadApiManualSync(mode: "all" | "update", options?: { manageLoading?: boolean; forceBookIDs?: string[]; forceMpBookIDs?: string[] }) {
        const startedAt = Date.now();
        let normalResult: any = null;
        let mpResult: any = null;
        const template = (await plugin.loadData("weread_templates") || "").trim();
        if (!template) {
            const report = buildWereadSyncReport({
                startedAt,
                endedAt: Date.now(),
                trigger: "manual",
                errors: ["请先配置微信读书笔记模板"],
            });
            await saveWereadSyncReportAndApplyStatus(plugin, report);
            showMessage(i18n.wereadApiManualSyncNeedTemplate || "请先配置微信读书笔记模板");
            return;
        }
        const apiKey = wereadApiKeyInput.trim();
        if (!wereadApiKeyVerified || !apiKey) {
            const report = buildWereadSyncReport({
                startedAt,
                endedAt: Date.now(),
                trigger: "manual",
                errors: ["API Key 未验证"],
            });
            await saveWereadSyncReportAndApplyStatus(plugin, report);
            showMessage("请先验证微信读书 API Key");
            return;
        }
        const manageLoading = options?.manageLoading !== false;
        if (manageLoading) {
            isSyncing = true;
        }
        try {
            normalResult = await syncWereadApiNormalBooks(plugin, apiKey, template, { mode, forceBookIDs: options?.forceBookIDs || [] });

            const mpTemplate = (await plugin.loadData("weread_mp_templates") || "").trim();
            if (mpTemplate) {
                mpResult = await syncWereadApiMpAccounts(plugin, apiKey, mpTemplate, { mode, forceBookIDs: options?.forceMpBookIDs || [] });
            }

            const report = buildWereadSyncReport({
                startedAt,
                endedAt: Date.now(),
                trigger: "manual",
                normalResult,
                mpResult,
            });
            await saveWereadSyncReportAndApplyStatus(plugin, report);

            const totalPlanned = normalResult.planned + (mpResult?.planned || 0);
            const totalFailed = normalResult.failed + (mpResult?.failed || 0);

            if (totalPlanned === 0) {
                showMessage(i18n.wereadSyncNoWork || "没有需要同步的内容");
            } else if (totalFailed > 0 && totalPlanned === totalFailed) {
                showMessage(i18n.wereadSyncFinishedWithError || "微信读书同步完成，部分内容失败");
            } else {
                showMessage(i18n.wereadSyncFinished || "微信读书同步完成");
            }
        } catch (error) {
            const report = buildWereadSyncReport({
                startedAt,
                endedAt: Date.now(),
                trigger: "manual",
                normalResult,
                mpResult,
                errors: [error?.message || "手动同步异常"],
            });
            await saveWereadSyncReportAndApplyStatus(plugin, report);
            showMessage(`${i18n.wereadApiManualSyncFailed || "同步失败"}：${error?.message || ""}`);
        } finally {
            if (manageLoading) {
                isSyncing = false;
            }
        }
    }

    async function handleWereadApiManualSyncWithNewSourceDialog(mode: "all" | "update") {
        if (isSyncing || isPreparingWereadApiSync) return;
        if (!isNotebookListReady) {
            showMessage(i18n.showMessage15);
            return;
        }
        const template = (await plugin.loadData("weread_templates") || "").trim();
        if (!template) {
            showMessage(i18n.wereadApiManualSyncNeedTemplate || "请先配置微信读书笔记模板");
            return;
        }
        const apiKey = wereadApiKeyInput.trim();
        isPreparingWereadApiSync = true;
        isSyncing = true;
        wereadApiSyncPreparingMessage = i18n.wereadApiCheckingNewSources || "正在检查微信读书新来源，请稍候...";
        showMessage(wereadApiSyncPreparingMessage);
        try {
            const result = await showWereadApiNewSourcesDialogAndSync(
                plugin,
                apiKey,
                mode,
                (forceOptions?) => runWereadApiManualSync(mode, { manageLoading: false, ...forceOptions })
            );
            if (result === "cancelled") {
                showMessage(i18n.wereadSyncCancelled || "同步已取消");
            }
        } catch (error) {
            const message = error?.message || "同步失败";
            showMessage(`${i18n.wereadApiManualSyncFailed || "同步失败"}：${message}`);
        } finally {
            isPreparingWereadApiSync = false;
            wereadApiSyncPreparingMessage = "";
            isSyncing = false;
        }
    }

    onMount(async () => {
        // 加载本地配置
        const savedPositionMark = await plugin.loadData("weread_position_mark");
        wereadPositionMark = normalizeWereadPositionMark(savedPositionMark);
        const wereadSetting = await loadPluginData(plugin, "weread_settings", DEFAULT_WEREAD_SETTINGS);
        autoSync = wereadSetting.autoSync;
        skipNewBookCheck = wereadSetting.skipNewBookCheck;
        const savedTemplates = await plugin.loadData("weread_templates");
        if (savedTemplates) {
            wereadTemplates = savedTemplates;
        }
        const savedMpTemplates = await plugin.loadData("weread_mp_templates");
        if (savedMpTemplates) {
            wereadMpTemplates = savedMpTemplates;
        }

        await loadWereadAuthSettings();

        if (wereadApiKeyVerified && wereadApiKeyInput.trim()) {
            const cached = await plugin.loadData("temporary_weread_notebooksList");
            if (Array.isArray(cached) && cached.length > 0) {
                notebooksList = cached;
                applyNotebookListState(cached);
            }

            await loadCachedReadingStats();

            try {
                await getNotebooksList({ preserveCacheOnFail: true });
            } catch {
            }

            try {
                await refreshReadingStats({ silent: true });
            } catch {
            }
        } else {
            await ensureWereadApiModeState(plugin);
            wereadApiModeState = await plugin.loadData("weread_api_mode_state");
        }
    });

    function applyNotebookListState(list: any[]) {
        notebooksList = list;
        isNotebookListReady = true;

        const totalNoteCount = list.reduce(
            (sum, book) => sum + (book.totalNoteCount ?? book.noteCount + book.reviewCount + book.bookmarkCount),
            0,
        );

        const now = new Date();
        const latestSyncTime = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

        notebooksInfo = `
            <div class="summary-info">
                ${i18nReplace("syncTime", "截止同步时间：{time}", {
                    "{time}": `<span class="time">${latestSyncTime}</span>`
                })}
            </div>
            <div class="summary-info">
                ${i18nReplace("notebooksSummary", "你在<span class=\"count\">{bookCount}</span>本书中做了<span class=\"count\">{noteCount}</span>条笔记~", {
                    "{bookCount}": `<span class="count">${list.length}</span>`,
                    "{noteCount}": `<span class="count">${totalNoteCount}</span>`,
                })}
            </div>
        `;
    }

    async function getNotebooksList(options?: { preserveCacheOnFail?: boolean }) {
        isNotebookListLoading = true;
        if (!options?.preserveCacheOnFail) {
            isNotebookListReady = false;
            await plugin.saveData("weread_notebooksList_readyAt", null);
        }

        try {
            const trimmedKey = wereadApiKeyInput.trim();
            if (wereadApiKeyVerified && trimmedKey) {
                notebooksList = await buildWereadApiNotebookCache(trimmedKey);

                await plugin.saveData("temporary_weread_notebooksList", notebooksList);
                await plugin.saveData("weread_notebooksList_readyAt", Date.now());

                isNotebookListReady = true;

                const now = new Date();
                const latestSyncTime = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

                const totalNoteCount = notebooksList.reduce(
                    (sum, book) => sum + (book.totalNoteCount ?? book.noteCount + book.reviewCount + book.bookmarkCount),
                    0,
                );

                notebooksInfo = `
                    <div class="summary-info">
                        ${i18nReplace("syncTime", "截止同步时间：{time}", {
                            "{time}": `<span class="time">${latestSyncTime}</span>`
                        })}
                    </div>
                    <div class="summary-info">
                        ${i18nReplace("notebooksSummary", "你在<span class=\"count\">{bookCount}</span>本书中做了<span class=\"count\">{noteCount}</span>条笔记~", {
                            "{bookCount}": `<span class="count">${notebooksList.length}</span>`,
                            "{noteCount}": `<span class="count">${totalNoteCount}</span>`,
                        })}
                    </div>
                `;
            }
        } catch (error) {
            if (options?.preserveCacheOnFail) {
                if (!notebooksList || notebooksList.length === 0) {
                    isNotebookListReady = false;
                }
            } else {
                isNotebookListReady = false;
                await plugin.saveData("temporary_weread_notebooksList", null);
                await plugin.saveData("weread_notebooksList_readyAt", null);
            }
            console.error("[微信读书] 获取书籍列表失败:", error);
            throw error;
        } finally {
            isNotebookListLoading = false;
        }
    }

    async function loadCachedReadingStats() {
        try {
            const cached = await plugin.loadData("weread_reading_stats_cache");
            if (cached && cached.weekly && cached.monthly) {
                readingStats = cached;
            }
        } catch (e) {
            console.warn("[微信读书] 加载阅读统计缓存失败");
        }
    }

    async function refreshReadingStats(options?: { silent?: boolean }) {
        const apiKey = wereadApiKeyInput.trim();
        if (!wereadApiKeyVerified || !apiKey) return;

        isLoadingReadingStats = true;
        try {
            const result = await buildWereadApiReadingStats(apiKey);
            readingStats = result;
            readingStatsError = "";
            await plugin.saveData("weread_reading_stats_cache", result);
        } catch (error: any) {
            readingStatsError = error?.message || i18nText("wereadReadingStatsLoadFailed", "阅读统计加载失败");
            if (!options?.silent) {
                showMessage(readingStatsError);
            }
        } finally {
            isLoadingReadingStats = false;
        }
    }

    async function openReadingStatsDialog() {
        if (!readingStats) {
            await refreshReadingStats({ silent: false });
        }
        if (!readingStats) {
            showMessage(i18nText("wereadReadingStatsEmpty", "暂无阅读统计数据"));
            return;
        }
        createWereadReadingStatsDialog(plugin, readingStats)();
    }

    async function openCachedNotebooksDialog() {
        let cachedNotebooks = Array.isArray(notebooksList) && notebooksList.length > 0
            ? notebooksList
            : [];

        if (cachedNotebooks.length === 0) {
            const savedCache = await plugin.loadData("temporary_weread_notebooksList");
            if (Array.isArray(savedCache)) {
                cachedNotebooks = savedCache;
                notebooksList = savedCache;
            }
        }

        if (!Array.isArray(cachedNotebooks)) {
            cachedNotebooks = [];
        }

        let enhancedBooks = cachedNotebooks;
        try {
            enhancedBooks = await attachWereadApiLocalNoteDocs(plugin, cachedNotebooks);
        } catch {
        }

        const showDialog = createNotebooksDialog(plugin, enhancedBooks);
        showDialog();
    }

    async function openBookShelf() {
        const apiKey = wereadApiKeyInput.trim();
        if (!wereadApiKeyVerified || !apiKey) {
            showMessage("请先验证微信读书 API Key");
            return;
        }
        loadingBookShelf = true;
        try {
            const shelfList = await buildApiBookShelf(apiKey, notebooksList);
            let enhancedBooks = shelfList;
            try {
                enhancedBooks = await attachWereadApiLocalNoteDocs(plugin, shelfList);
            } catch {
            }
            const showDialog = createBookShelfDialog(plugin, enhancedBooks);
            showDialog();
        } catch (error) {
            console.error("Failed to obtain bookshelf information", error);
            showMessage(i18n.showMessage11);
        } finally {
            loadingBookShelf = false;
        }
    }

    async function createManageISBNDialog() {
        const customISBNBooks = await plugin.loadData("weread_customBooksISBN") || [];

        if (customISBNBooks.length === 0) {
            showMessage(i18n.showMessage12);
            return;
        }

        const { validISBNs, validBookNames } = await getCurrentValidBookIdentifiers(plugin);

        const dialog = svelteDialog({
            title: i18n.manageISBNDialogTitle,
            constructor: (containerEl: HTMLElement) => {
                return new wereadManageISBN({
                    target: containerEl,
                    props: {
                        plugin,
                        customISBNBooks: customISBNBooks,
                        validISBNs: Array.from(validISBNs),
                        validBookNames: Array.from(validBookNames),
                        onConfirm: () => {
                            dialog.close();
                        },
                        onCancel: () => {
                            dialog.close();
                        },
                    },
                });
            },
        });
    }

    async function loadWereadAuthSettings() {
        const state = await loadWereadAuthStateFromService(plugin);
        wereadApiKeyInput = state.apiKey || "";
        wereadApiKeyVerified = state.verified || false;
        wereadApiKeyVerifiedAt = state.verifiedAt || 0;
        wereadApiKeyLastError = state.lastError || "";
    }

    async function verifyWereadApiKey() {
        const trimmed = wereadApiKeyInput.trim();
        if (!trimmed) {
            showMessage(i18n.showMessageWereadApiKeyRequired);
            return;
        }

        isVerifyingWereadApiKey = true;
        try {
            const state = await verifyAndSaveWereadApiKeyFromService(plugin, trimmed);
            wereadApiKeyInput = state.apiKey;
            wereadApiKeyVerified = state.verified;
            wereadApiKeyVerifiedAt = state.verifiedAt;
            wereadApiKeyLastError = state.lastError;

            showMessage(state.verified ? (i18n.showMessageWereadApiKeyVerified) : (i18n.showMessageWereadApiKeyInvalid));

            if (state.verified) {
                try {
                    await getNotebooksList();
                } catch {}
                try {
                    await refreshReadingStats({ silent: true });
                } catch {}
            }
        } catch (error: any) {
            wereadApiKeyVerified = false;
            wereadApiKeyVerifiedAt = 0;
            wereadApiKeyLastError = error?.message || "验证失败";
            showMessage(i18n.showMessageWereadApiKeyInvalid);
        } finally {
            isVerifyingWereadApiKey = false;
        }
    }

    async function clearWereadApiKey() {
        wereadApiKeyInput = "";
        wereadApiKeyVerified = false;
        wereadApiKeyVerifiedAt = 0;
        wereadApiKeyLastError = "";
        notebooksList = [];
        notebooksInfo = "";
        isNotebookListReady = false;
        readingStats = null;
        readingStatsError = "";

        await clearWereadApiKeyFromService(plugin);

        showMessage(i18n.showMessageWereadApiKeyCleared);
    }

    async function createIgnoredBooksDialog() {
        const ignoredBooks = await plugin.loadData("weread_ignoredBooks") || [];

        if (ignoredBooks.length == 0) {
            showMessage(i18n.showMessage13);
            return;
        }

        const dialog = svelteDialog({
            title: i18n.ignoredBooksDialogTitle,
            constructor: (containerEl: HTMLElement) => {
                return new wereadIgnoredBooksDialog({
                    target: containerEl,
                    props: {
                        plugin,
                        ignoredBooks: ignoredBooks,
                        onConfirm: () => {
                            dialog.close();
                        },
                        onCancel: () => {
                            dialog.close();
                        },
                    },
                });
            },
        });
    }

    async function createWereadUseBookIDBooksDialog() {
        const useBookIDBooks = await plugin.loadData("weread_useBookIDBooks") || [];

        if (useBookIDBooks.length == 0) {
            showMessage(i18n.showMessage42);
            return;
        }

        const { validBookIDs, validBookNames } = await getCurrentValidBookIdentifiers(plugin);

        const dialog = svelteDialog({
            title: i18n.useBookIDBooksDialogTitle,
            constructor: (containerEl: HTMLElement) => {
                return new wereadUseBookIDBooksDialog({
                    target: containerEl,
                    props: {
                        plugin,
                        useBookIDBooks: useBookIDBooks,
                        validBookIDs: Array.from(validBookIDs),
                        validBookNames: Array.from(validBookNames),
                        onConfirm: () => {
                            dialog.close();
                        },
                        onCancel: () => {
                            dialog.close();
                        },
                    },
                });
            },
        });
    }
</script>

<div class="wereadSetting">
    {#if databaseStatus === "error"}
        <div class="error-message">{i18n.databaseStatusMessage3}</div>
    {:else if databaseStatus === "success"}
        <div class="weread-section">
            <div class="weread-section-title">{i18n.wereadSectionTutorial}</div>
            <div class="weread-settings-row">
                <div class="weread-row-label">
                    <span>{i18n.tutorial}</span>
                </div>
                <div class="weread-row-action">
                    <a
                        class="weread-tutorial-link"
                        href="https://blog.glaube-ty.top/archives/019d1f09-0d1c-71b5-a53d-395321304440"
                        target="_blank"
                    >{i18n.tutorialLink}</a>
                </div>
            </div>
        </div>

        <div class="weread-section">
            <div class="weread-section-title">{i18n.wereadSectionApiKey}</div>
            <div class="weread-settings-row">
                <div class="weread-row-info">
                    <div class="weread-row-title">{i18n.wereadApiKeyTitle}</div>
                    <div class="weread-row-desc">{i18n.wereadApiKeyDesc}</div>
                    <div class="weread-api-key-help">
                        {i18nText("wereadApiKeyApplyTip", "还没有 API Key？")}
                        <a
                            href="https://weread.qq.com/r/weread-skills"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {i18nText("wereadApiKeyApplyLink", "前往微信读书申请")}
                        </a>
                    </div>
                </div>
                <div class="weread-row-control">
                    <input
                        type="password"
                        class="b3-text-field"
                        placeholder={i18n.wereadApiKeyPlaceholder}
                        bind:value={wereadApiKeyInput}
                        style="width: 100%; max-width: 400px;"
                    />
                </div>
            </div>
            <div class="weread-settings-row">
                <div class="weread-row-info">
                    <div class="weread-row-title">{i18n.wereadApiKeyStatus}</div>
                    <div class="weread-row-desc">
                        {#if isVerifyingWereadApiKey}
                            <span class="weread-status-validating">{i18n.wereadApiKeyStatusValidating}</span>
                        {:else if wereadApiKeyVerified}
                            <span class="weread-status-verified">✅ {i18n.wereadApiKeyStatusVerified}：{maskWereadApiKey(wereadApiKeyInput)}</span>
                            {#if wereadApiKeyVerifiedAt > 0}
                                <span class="weread-verified-time">
                                    {i18n.wereadApiKeyLastVerifiedAt}: {new Date(wereadApiKeyVerifiedAt).toLocaleString()}
                                </span>
                            {/if}
                        {:else if wereadApiKeyLastError}
                            <span class="weread-status-invalid">❌ {i18n.wereadApiKeyStatusInvalid}: {wereadApiKeyLastError}</span>
                        {:else if !wereadApiKeyInput}
                            <span class="weread-status-unconfigured">{i18n.wereadApiKeyStatusUnconfigured}</span>
                        {/if}
                    </div>
                </div>
                <div class="weread-row-control">
                    <button
                        class="b3-button b3-button--outline"
                        disabled={isVerifyingWereadApiKey}
                        on:click={verifyWereadApiKey}>{i18n.wereadApiKeyVerify}</button>
                    <button
                        class="b3-button b3-button--outline"
                        disabled={isVerifyingWereadApiKey}
                        on:click={clearWereadApiKey}>{i18n.wereadApiKeyClear}</button>
                </div>
            </div>
            {#if wereadApiModeState}
                <div class="weread-settings-row">
                    <div class="weread-row-info">
                        <div class="weread-row-title">{i18n.wereadApiModeStatusTitle}</div>
                        <div class="weread-row-desc">
                            <div>{i18n.wereadApiModeStatusDesc}</div>
                            <div>{i18n.wereadApiModeProvider}</div>
                            <div>{i18n.wereadApiModeOrdinaryBookEnabled}</div>
                            <div>{i18n.wereadApiModeMpEnabled}</div>
                        </div>
                    </div>
                </div>
            {/if}
        </div>

        <div class="weread-section">
            <div class="weread-section-title">{i18n.wereadSectionOverview}</div>
            {#if wereadApiKeyVerified}
                {#if notebooksInfo}
                    <div class="weread-settings-row">
                        <div class="weread-row-info">
                            <div class="weread-row-title">{i18n.hasNotesBooks}</div>
                            <div class="weread-row-desc">{i18n.hasNotesBooksDesc}</div>
                        </div>
                        <div class="weread-row-control">
                            <button
                                class="b3-button b3-button--outline"
                                disabled={isNotebookListLoading}
                                on:click={openCachedNotebooksDialog}>{i18n.hasNotesBooks}</button>
                        </div>
                    </div>
                    <div class="weread-settings-row">
                        <div class="weread-row-info">
                            <div class="weread-row-title">{i18n.bookShelf}</div>
                            <div class="weread-row-desc">{i18n.bookShelfDesc}</div>
                        </div>
                        <div class="weread-row-control">
                            <button class="b3-button b3-button--outline" on:click={openBookShelf}>{i18n.bookShelf}</button>
                        </div>
                    </div>
                    {#if loadingBookShelf}
                        <div class="weread-settings-row">
                            <div class="weread-row-info"></div>
                            <div class="weread-row-control">
                                <div class="weread-loading-notice">⌛ {i18n.loadingBookShelf}</div>
                            </div>
                        </div>
                    {/if}

                    {#if readingStatsError}
                        <div class="weread-reading-stats-error">{readingStatsError}</div>
                    {/if}

                    <div class="weread-dashboard-grid">
                        <div class="weread-dashboard-card">
                            <span class="weread-dashboard-label">{i18nText("wereadDashboardNotebooks", "有笔记书籍")}</span>
                            <span class="weread-dashboard-value">
                                {#if notebooksList.length > 0}
                                    {notebooksList.length}
                                {:else}
                                    --
                                {/if}
                            </span>
                        </div>
                        <div class="weread-dashboard-card">
                            <span class="weread-dashboard-label">{i18nText("wereadDashboardNotes", "笔记数量")}</span>
                            <span class="weread-dashboard-value">
                                {#if notebooksList.length > 0}
                                    {notebooksList.reduce((sum, book) => sum + (book.totalNoteCount ?? book.noteCount + book.reviewCount + book.bookmarkCount), 0)}
                                {:else}
                                    --
                                {/if}
                            </span>
                        </div>
                        <div class="weread-dashboard-card">
                            <span class="weread-dashboard-label">{i18nText("wereadDashboardShelf", "书架条目")}</span>
                            <span class="weread-dashboard-value">
                                {#if isLoadingReadingStats}
                                    {i18nText("wereadReadingStatsLoading", "正在加载...")}
                                {:else if readingStats?.shelf}
                                    {readingStats.shelf.total}
                                {:else}
                                    --
                                {/if}
                            </span>
                        </div>
                        <div class="weread-dashboard-card">
                            <span class="weread-dashboard-label">{i18nText("wereadDashboardMonthlyDays", "本月天数")}</span>
                            <span class="weread-dashboard-value">
                                {#if isLoadingReadingStats}
                                    {i18nText("wereadReadingStatsLoading", "正在加载...")}
                                {:else if readingStats}
                                    {readingStats.monthly.readDays}
                                {:else}
                                    --
                                {/if}
                            </span>
                        </div>
                        <div class="weread-dashboard-card">
                            <span class="weread-dashboard-label">{i18nText("wereadDashboardWeeklyRead", "本周阅读")}</span>
                            <span class="weread-dashboard-value">
                                {#if isLoadingReadingStats}
                                    {i18nText("wereadReadingStatsLoading", "正在加载...")}
                                {:else if readingStats}
                                    {formatReadingDuration(readingStats.weekly.totalReadTime)}
                                {:else}
                                    --
                                {/if}
                            </span>
                        </div>
                        <div class="weread-dashboard-card">
                            <span class="weread-dashboard-label">{i18nText("wereadDashboardMonthlyRead", "本月阅读")}</span>
                            <span class="weread-dashboard-value">
                                {#if isLoadingReadingStats}
                                    {i18nText("wereadReadingStatsLoading", "正在加载...")}
                                {:else if readingStats}
                                    {formatReadingDuration(readingStats.monthly.totalReadTime)}
                                {:else}
                                    --
                                {/if}
                            </span>
                        </div>
                        <div class="weread-dashboard-card">
                            <span class="weread-dashboard-label">{i18nText("wereadDashboardAnnualRead", "本年阅读")}</span>
                            <span class="weread-dashboard-value">
                                {#if isLoadingReadingStats}
                                    {i18nText("wereadReadingStatsLoading", "正在加载...")}
                                {:else if readingStats}
                                    {formatReadingDuration(readingStats.annually.totalReadTime)}
                                {:else}
                                    --
                                {/if}
                            </span>
                        </div>
                        <div class="weread-dashboard-card">
                            <span class="weread-dashboard-label">{i18nText("wereadDashboardOverallRead", "总阅读")}</span>
                            <span class="weread-dashboard-value">
                                {#if isLoadingReadingStats}
                                    {i18nText("wereadReadingStatsLoading", "正在加载...")}
                                {:else if readingStats}
                                    {formatReadingDuration(readingStats.overall.totalReadTime)}
                                {:else}
                                    --
                                {/if}
                            </span>
                        </div>
                    </div>

                    <div class="weread-reading-actions">
                        <button
                            class="b3-button b3-button--outline"
                            disabled={isLoadingReadingStats}
                            on:click={openReadingStatsDialog}>{i18nText("wereadReadingStatsButton", "查看阅读统计")}</button>
                    </div>
                {:else}
                    <div class="weread-settings-row">
                        <div class="weread-row-info"></div>
                        <div class="weread-row-control">
                            <div class="weread-loading-notice">⌛ {i18n.loadingBookInfo}</div>
                            <div class="weread-loading-notice">{i18n.loadingBookInfoTip}</div>
                        </div>
                    </div>
                {/if}
            {:else}
                <div class="weread-settings-row">
                    <div class="weread-row-info"></div>
                    <div class="weread-row-control">
                        <div class="weread-api-warning">{i18n.wereadApiKeyStatusUnconfigured}</div>
                    </div>
                </div>
            {/if}
        </div>

        <div class="weread-section">
            <div class="weread-section-title">{i18n.wereadSectionBooks}</div>
            <div class="weread-settings-row">
                <div class="weread-row-info">
                    <div class="weread-row-title">{i18n.manageCustomISBNBooks}</div>
                    <div class="weread-row-desc">{i18n.manageCustomISBNBooksDesc}</div>
                </div>
                <div class="weread-row-control">
                    <button class="b3-button b3-button--outline" on:click={createManageISBNDialog}>{i18n.manageCustomISBNBooks}</button>
                </div>
            </div>
            <div class="weread-settings-row">
                <div class="weread-row-info">
                    <div class="weread-row-title">{i18n.manageIgnoredBooks}</div>
                    <div class="weread-row-desc">{i18n.manageIgnoredBooksDesc}</div>
                </div>
                <div class="weread-row-control">
                    <button class="b3-button b3-button--outline" on:click={createIgnoredBooksDialog}>{i18n.manageIgnoredBooks}</button>
                </div>
            </div>
            <div class="weread-settings-row">
                <div class="weread-row-info">
                    <div class="weread-row-title">{i18n.manageUseBookIDBooks}</div>
                    <div class="weread-row-desc">{i18n.manageUseBookIDBooksDesc}</div>
                </div>
                <div class="weread-row-control">
                    <button class="b3-button b3-button--outline" on:click={createWereadUseBookIDBooksDialog}>{i18n.manageUseBookIDBooks}</button>
                </div>
            </div>
        </div>

        <div class="weread-section">
            <div class="weread-section-title">{i18n.wereadSectionTemplate}</div>
            <div class="weread-settings-row">
                <div class="weread-row-info">
                    <div class="weread-row-title">{i18n.setBookNotesTemplate}</div>
                    <div class="weread-row-desc">{i18n.setBookNotesTemplateDesc}</div>
                </div>
                <div class="weread-row-control">
                    <button
                        class="b3-button b3-button--outline"
                        on:click={createWereadNotesTemplateDialog(
                            i18n,
                            async (newWereadTemplates) => {
                                wereadTemplates = newWereadTemplates;
                                await plugin.saveData("weread_templates", newWereadTemplates);
                            },
                            wereadTemplates,
                            i18n.setBookNotesTemplateTitle,
                        )}>{i18n.setBookNotesTemplate}</button>
                    <span class="template-status" class:configured={wereadTemplates?.trim()}>{wereadTemplates?.trim() ? i18n.templateConfigured : i18n.templateNotConfigured}</span>
                </div>
            </div>
            <div class="weread-settings-row">
                <div class="weread-row-info">
                    <div class="weread-row-title">{i18n.setMpNotesTemplate}</div>
                    <div class="weread-row-desc">{i18n.setMpNotesTemplateDesc}</div>
                </div>
                <div class="weread-row-control">
                    <button
                        class="b3-button b3-button--outline"
                        on:click={createWereadNotesTemplateDialog(
                            i18n,
                            async (newWereadMpTemplates) => {
                                wereadMpTemplates = newWereadMpTemplates;
                                await plugin.saveData("weread_mp_templates", newWereadMpTemplates);
                            },
                            wereadMpTemplates,
                            i18n.setMpNotesTemplateTitle,
                        )}>{i18n.setMpNotesTemplate}</button>
                    <span class="template-status" class:configured={wereadMpTemplates?.trim()}>{wereadMpTemplates?.trim() ? i18n.templateConfigured : i18n.templateNotConfigured}</span>
                </div>
            </div>
            <div class="weread-settings-row">
                <div class="weread-row-info">
                    <div class="weread-row-title">{i18n.positionMark}</div>
                    <div class="weread-row-desc" title={i18n.notesSyncPositionTip}>{i18n.positionMarkDesc}</div>
                </div>
                <div class="weread-row-control weread-row-control--inline">
                    <input type="text" bind:value={wereadPositionMark} class="weread-position-input" />
                    <button
                        class="b3-button b3-button--outline"
                        on:click={async () => {
                            const normalizedMark = normalizeWereadPositionMark(wereadPositionMark);
                            wereadPositionMark = normalizedMark;
                            await plugin.saveData(
                                "weread_position_mark",
                                normalizedMark,
                            );
                            showMessage(i18n.showMessage14);
                        }}
                    >{i18n.confirm}</button>
                </div>
            </div>
        </div>

        <div class="weread-section">
            <div class="weread-section-title">{i18n.wereadSectionSync}</div>
            {#if isPreparingWereadApiSync}
                <div class="weread-row-info" style="color: var(--b3-theme-primary);">
                    {i18n.wereadApiCheckingNewSourcesDesc || "正在补全书籍 ISBN 和检测数据库匹配，期间请不要重复点击同步按钮"}
                </div>
            {/if}
            <div class="weread-settings-row">
                <div class="weread-row-info">
                    <div class="weread-row-title">{i18n.syncAll}</div>
                    <div class="weread-row-desc">{i18n.syncAllDesc}</div>
                </div>
                <div class="weread-row-control">
                    <button
                        class="b3-button b3-button--outline"
                        disabled={isNotebookListLoading || !isNotebookListReady || isSyncing || isPreparingWereadApiSync}
                        on:click={async () => {
                            if (isSyncing || isPreparingWereadApiSync) return;
                            await handleWereadApiManualSyncWithNewSourceDialog("all");
                        }}>{i18n.syncAll}</button>
                </div>
            </div>
            <div class="weread-settings-row">
                <div class="weread-row-info">
                    <div class="weread-row-title">{i18n.updateSync}</div>
                    <div class="weread-row-desc">{i18n.updateSyncDesc}</div>
                </div>
                <div class="weread-row-control">
                    <button
                        class="b3-button b3-button--outline"
                        disabled={isNotebookListLoading || !isNotebookListReady || isSyncing || isPreparingWereadApiSync}
                        on:click={async () => {
                            if (isSyncing || isPreparingWereadApiSync) return;
                            await handleWereadApiManualSyncWithNewSourceDialog("update");
                        }}>{i18n.updateSync}</button>
                </div>
            </div>
            <div class="weread-settings-row">
                <div class="weread-row-info">
                    <div class="weread-row-title">{i18n.skipNewBookCheck}</div>
                    <div class="weread-row-desc">{i18n.skipNewBookCheckDesc}</div>
                </div>
                <div class="weread-row-control">
                    <label class="settings-switch-label">
                        <input
                            type="checkbox"
                            class="settings-switch"
                            title={i18n.skipNewBookCheckTip}
                            bind:checked={skipNewBookCheck}
                            on:change={async () => {
                                const current = await loadPluginData(plugin, "weread_settings", DEFAULT_WEREAD_SETTINGS);
                                await plugin.saveData("weread_settings", { ...current, skipNewBookCheck });
                            }}
                        />
                        <span class="settings-switch-track">
                            <span class="settings-switch-thumb"></span>
                        </span>
                    </label>
                </div>
            </div>
            <div class="weread-settings-row">
                <div class="weread-row-info">
                    <div class="weread-row-title">{i18n.autoSync}</div>
                    <div class="weread-row-desc">{i18n.autoSyncDesc}</div>
                </div>
                <div class="weread-row-control">
                    <label class="settings-switch-label">
                        <input
                            type="checkbox"
                            class="settings-switch"
                            title={i18n.autoSyncTip}
                            bind:checked={autoSync}
                            on:change={async () => {
                                const current = await loadPluginData(plugin, "weread_settings", DEFAULT_WEREAD_SETTINGS);
                                await plugin.saveData("weread_settings", { ...current, autoSync });
                            }}
                        />
                        <span class="settings-switch-track">
                            <span class="settings-switch-thumb"></span>
                        </span>
                    </label>
                </div>
            </div>
            {#if isSyncing}
                <div class="weread-settings-row">
                    <div class="weread-row-info"></div>
                    <div class="weread-row-control">
                        <div class="weread-syncing-notice">
                            <span class="weread-syncing-title">⏳ {i18n.syncing}</span>
                            <span class="weread-syncing-tip">{i18n.syncingTip}</span>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    {/if}
</div>
