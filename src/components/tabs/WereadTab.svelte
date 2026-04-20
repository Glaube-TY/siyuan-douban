<script lang="ts">
    import { showMessage, I18N, fetchSyncPost } from "siyuan";
    import { sql } from "@/api";
    import { onMount } from "svelte";
    import { svelteDialog } from "@/libs/dialog";
    import PromiseLimitPool from "@/libs/promise-pool";
    import {
        createWereadDialog,
        createWereadQRCodeDialog,
        createNotebooksDialog,
        createBookShelfDialog,
        createWereadNotesTemplateDialog,
        checkWrVid,
        verifyCookie,
    } from "@/utils/weread/loginWeread";
    import {
        getNotebooks,
        getBook,
        getBookShelf,
    } from "@/utils/weread/wereadInterface";
    import { syncWereadNotes, buildTemporaryNotebookList } from "@/utils/weread/syncWereadNotes";
    import { loadPluginData, DEFAULT_WEREAD_COOKIE, DEFAULT_WEREAD_SETTINGS } from "@/utils/core/configDefaults";

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
            let database = await fetchSyncPost('/api/av/getAttributeView', { id: avID });
            let avData = database.data?.av || {};
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
                await fetchSyncPost('/api/av/removeAttributeViewBlocks', { avID, srcIDs: blockIDsToRemove });
                database = await fetchSyncPost('/api/av/getAttributeView', { id: avID });
                avData = database.data?.av || {};
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
    export let cookies = "";

    export let wereadTemplates = "";
    export let wereadMpTemplates = "";
    export let wereadPositionMark = "";

    export let databaseStatus = "";

    let autoSync = false;
    let isSyncing = false;
    let userVid = "";
    let checkMessage = "";
    let notebookdata: any = "";

    let latestSyncTime = "";
    let notebooksInfo = "";
    let notebooksList = [];
    let loadingBookShelf = false;

    // 微信读书书籍列表预加载状态
    let isNotebookListLoading = false;
    let isNotebookListReady = false;

    // 保存二维码 cookie 后重新从本地读取
    async function saveAndReloadQRCodeCookies(autoCookies: string): Promise<string> {
        const savedata = { cookies: autoCookies, isQRCode: true };
        await plugin.saveData("weread_cookie", savedata);
        const reloaded = await loadPluginData(plugin, "weread_cookie", DEFAULT_WEREAD_COOKIE);
        return reloaded.cookies;
    }

    // 基于 cookie 字符串执行校验并更新状态，返回校验结果
    async function verifyAndUpdateStatus(cookieStr: string): Promise<{ success: boolean; userVid: string; loginDue: boolean }> {
        const result = checkWrVid(cookieStr);
        const vid = result.userVid;
        userVid = vid;

        if (vid) {
            const verifyResult = await verifyCookie(plugin, cookieStr, vid);
            checkMessage = verifyResult.message;
            return { success: verifyResult.success, userVid: vid, loginDue: verifyResult.loginDue };
        } else {
            checkMessage = i18n.checkMessage6;
            showMessage(i18n.checkMessage6);
            return { success: false, userVid: "", loginDue: false };
        }
    }

    onMount(async () => {
        // 加载本地配置
        const savedcookies = await loadPluginData(plugin, "weread_cookie", DEFAULT_WEREAD_COOKIE);
        wereadPositionMark = await plugin.loadData("weread_position_mark");
        const wereadSetting = await loadPluginData(plugin, "weread_settings", DEFAULT_WEREAD_SETTINGS);
        autoSync = wereadSetting.autoSync;
        const savedTemplates = await plugin.loadData("weread_templates");
        if (savedTemplates) {
            wereadTemplates = savedTemplates;
        }
        const savedMpTemplates = await plugin.loadData("weread_mp_templates");
        if (savedMpTemplates) {
            wereadMpTemplates = savedMpTemplates;
        }

        // 检查并更新登录信息
        cookies = savedcookies.cookies;
        let shouldLoadNotebooks = false;

        if (cookies) {
            // 从 cookie 中获取用户ID
            const result = checkWrVid(cookies);
            userVid = result.userVid;

            // 判断是否从 cookie 中获取用户ID成功
            if (userVid) {
                if (savedcookies.isQRCode) {
                    // 扫码登录：使用 Electron 隐藏窗口校验
                    const verifyResult = await verifyAndUpdateStatus(cookies);

                    // 判断是否需要重新登录
                    if (verifyResult.loginDue) {
                        checkMessage = i18n.checkMessage1;
                        try {
                            // 创建不可见的登陆窗口用于刷新登录信息
                            const refreshedCookies = await createWereadQRCodeDialog(
                                i18n,
                                false,
                            );

                            cookies = await saveAndReloadQRCodeCookies(refreshedCookies);
                            const reloadedVerify = await verifyAndUpdateStatus(cookies);

                            if (reloadedVerify.success) {
                                shouldLoadNotebooks = true;
                            } else if (!reloadedVerify.userVid) {
                                return;
                            }
                        } catch (error) {
                            checkMessage = i18n.checkMessage6;
                            showMessage(i18n.checkMessage6);
                            return;
                        }
                    } else if (verifyResult.success) {
                        // 登录有效，标记需要加载书单
                        shouldLoadNotebooks = true;
                    }
                } else {
                    // 手动 Cookie 登录：使用 forwardProxy 校验
                    const verifyResult = await verifyAndUpdateStatus(cookies);
                    if (verifyResult.success) {
                        shouldLoadNotebooks = true;
                    }
                }

                // 统一加载书单（最多一次）
                if (shouldLoadNotebooks) {
                    await getNotebooksList();
                }
            } else {
                showMessage(i18n.showMessage16);
            }
        } else {
            checkMessage = i18n.checkMessage7;
        }
    });

    async function getNotebooksList() {
        // 开始加载：重置状态，清理旧 ready 标记
        isNotebookListLoading = true;
        isNotebookListReady = false;
        await plugin.saveData("weread_notebooksList_readyAt", null);

        try {
            notebookdata = await getNotebooks(plugin, cookies);

            const syncDate = new Date(notebookdata.synckey * 1000);
            latestSyncTime = `${syncDate.toLocaleDateString()} ${syncDate.toLocaleTimeString()}`;

            // 使用共用的 helper 构建列表，确保字段结构统一
            notebooksList = await buildTemporaryNotebookList(plugin, cookies);

            // 保存缓存和 ready 标记（必须在设置 ready 状态之前完成）
            await plugin.saveData("temporary_weread_notebooksList", notebooksList);
            await plugin.saveData("weread_notebooksList_readyAt", Date.now());

            // 缓存保存成功后，才设置 ready 状态并更新界面
            isNotebookListReady = true;

            const totalNotes = notebooksList.reduce(
                (sum, book) => sum + book.noteCount,
                0,
            );

            notebooksInfo = `
                <div class="summary-info">
                    ${i18n.syncTime.replace("{time}", `<span class="time">${latestSyncTime}</span>`)}
                </div>
                <div class="summary-info">
                    ${i18n.notebooksSummary
                        .replace(
                            "{bookCount}",
                            `<span class="count">${notebookdata.totalBookCount}</span>`,
                        )
                        .replace(
                            "{noteCount}",
                            `<span class="count">${totalNotes}</span>`,
                        )}
                </div>
            `;
        } catch (error) {
            // 加载失败：确保状态为未就绪，并清理旧缓存避免误导后续手动同步
            isNotebookListReady = false;
            await plugin.saveData("temporary_weread_notebooksList", null);
            console.error("[微信读书] 获取书籍列表失败:", error);
            throw error;
        } finally {
            isNotebookListLoading = false;
        }
    }

    async function openBookShelf() {
        loadingBookShelf = true;
        try {
            const bookShelfInfo = await getBookShelf(plugin, cookies, userVid);
            const basicshelf = bookShelfInfo.books;

            // 使用并发池限制批量请求（并发数：5）
            const shelfPool = new PromiseLimitPool<{
                noteCount: number;
                reviewCount: number;
                bookID: string;
                title: string;
                author: string;
                cover: string;
                format: string;
                price: number;
                introduction: string;
                publishTime: string;
                category: string;
                isbn: string;
                publisher: string;
                totalWords: number;
                star: number;
                ratingCount: number;
                AISummary: string;
            }>(5);

            basicshelf.forEach((b: any) => {
                shelfPool.add(async () => {
                    try {
                        const details = await getBook(plugin, cookies, b.bookId);
                        return {
                            noteCount:
                                notebooksList.find(
                                    (n) => n.bookID === details.bookId,
                                )?.noteCount || 0,
                            reviewCount:
                                notebooksList.find(
                                    (n) => n.bookID === details.bookId,
                                )?.reviewCount || 0,
                            bookID: details.bookId,
                            title: details.title,
                            author: details.author,
                            cover: details.cover,
                            format: details.format,
                            price: details.price,
                            introduction: details.intro,
                            publishTime: details.publishTime,
                            category: details.category,
                            isbn: details.isbn,
                            publisher: details.publisher,
                            totalWords: details.totalWords,
                            star: details.newRating,
                            ratingCount: details.ratingCount,
                            AISummary: details.AISummary,
                        };
                    } catch {
                        return null;
                    }
                });
            });

            const shelfList = (await shelfPool.awaitAll()).filter((item) => item !== null);

            const showDialog = createBookShelfDialog(plugin, shelfList);
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
        <div style="margin-bottom: 10px;">
            <label for="tutorial">
                {i18n.tutorial}<a
                    id="tutorial"
                    href="https://blog.glaube-ty.top/archives/019d1f09-0d1c-71b5-a53d-395321304440"
                    >{i18n.tutorialLink}</a
                ></label
            >
        </div>
        <div class="cookie-weread-setting">
            <button
                class="scan-qrcode"
                on:click={async () => {
                    try {
                        const autoCookies = await createWereadQRCodeDialog(
                            i18n,
                            true,
                        );

                        cookies = await saveAndReloadQRCodeCookies(autoCookies);
                        const verifyResult = await verifyAndUpdateStatus(cookies);

                        if (verifyResult.success) {
                            await getNotebooksList();
                        }
                    } catch (error) {
                        // 用户取消操作，静默结束，不更新状态
                        if (error === "__CANCELLED__") {
                            return;
                        }
                        checkMessage = i18n.checkMessage6;
                        showMessage(i18n.checkMessage6);
                    }
                }}>{i18n.scanQRCodeLogin}</button>
            <button
                on:click={createWereadDialog(plugin, cookies, async (newCookies) => {
                    cookies = newCookies;
                    const savedata = {
                        cookies: newCookies,
                        isQRCode: false,
                    };
                    await plugin.saveData("weread_cookie", savedata);

                    const verifyResult = await verifyAndUpdateStatus(newCookies);
                    if (verifyResult.success) {
                        await getNotebooksList();
                    }
                })}>{i18n.fillCookie}</button
            >
            <span class="checking">{checkMessage}</span>
        </div>
        <div class="weread-notebooks-info">
            {#if checkMessage.includes("✅")}
                {#if notebooksInfo}
                    {@html notebooksInfo}
                    <div class="booksinfo-button">
                        <button
                            disabled={isNotebookListLoading || !isNotebookListReady}
                            on:click={() => {
                                if (isNotebookListLoading || !isNotebookListReady) {
                                    showMessage(i18n.showMessageWereadCacheNotReady);
                                    return;
                                }
                                createNotebooksDialog(plugin, notebooksList);
                            }}>{i18n.hasNotesBooks}</button
                        >
                        <button on:click={openBookShelf}
                            >{i18n.bookShelf}</button
                        >
                    </div>
                    {#if loadingBookShelf}
                        <div class="loading-notice">
                            ⌛ {i18n.loadingBookShelf}
                        </div>
                    {/if}
                {:else}
                    <div class="loading-notice">⌛ {i18n.loadingBookInfo}</div>
                    <div class="loading-notice">
                        {i18n.loadingBookInfoTip}
                    </div>
                {/if}
            {:else}
                <div class="cookie-warning">
                    {i18n.pleaseFillCookie}
                </div>
            {/if}
        </div>
        <div class="weread-custom-books">
            <button on:click={createManageISBNDialog}
                >{i18n.manageCustomISBNBooks}</button
            >
            <button on:click={createIgnoredBooksDialog}
                >{i18n.manageIgnoredBooks}</button
            >
            <button on:click={createWereadUseBookIDBooksDialog}
                >{i18n.manageUseBookIDBooks}</button
            >
        </div>
        <div class="weread-notes-template">
            <!-- 第一层：模板相关 -->
            <div class="template-row">
                <div class="template-item">
                    <button
                        on:click={createWereadNotesTemplateDialog(
                            i18n,
                            async (newWereadTemplates) => {
                                wereadTemplates = newWereadTemplates;
                                await plugin.saveData("weread_templates", newWereadTemplates);
                            },
                            wereadTemplates,
                            i18n.setBookNotesTemplateTitle,
                        )}>{i18n.setBookNotesTemplate}</button
                    >
                    <span class="template-status" class:configured={wereadTemplates?.trim()}>{wereadTemplates?.trim() ? i18n.templateConfigured : i18n.templateNotConfigured}</span>
                </div>
                <div class="template-item">
                    <button
                        on:click={createWereadNotesTemplateDialog(
                            i18n,
                            async (newWereadMpTemplates) => {
                                wereadMpTemplates = newWereadMpTemplates;
                                await plugin.saveData("weread_mp_templates", newWereadMpTemplates);
                            },
                            wereadMpTemplates,
                            i18n.setMpNotesTemplateTitle,
                        )}>{i18n.setMpNotesTemplate}</button
                    >
                    <span class="template-status" class:configured={wereadMpTemplates?.trim()}>{wereadMpTemplates?.trim() ? i18n.templateConfigured : i18n.templateNotConfigured}</span>
                </div>
            </div>
            <!-- 第二层：位置标记相关 -->
            <div class="position-row">
                <span class="position-label" title={i18n.notesSyncPositionTip}>{i18n.positionMark}:</span>
                <input type="text" bind:value={wereadPositionMark} class="position-input" />
                <button
                    class="position-confirm"
                    on:click={async () => {
                        await plugin.saveData(
                            "weread_position_mark",
                            wereadPositionMark,
                        );
                        showMessage(i18n.showMessage14);
                    }}
                >
                    {i18n.confirm}
                </button>
            </div>
        </div>
        <div class="sync-setting">
            <button
                disabled={!checkMessage.includes("✅") || isNotebookListLoading || !isNotebookListReady || isSyncing}
                on:click={async () => {
                    if (isSyncing) return;
                    if (!checkMessage.includes("✅")) {
                        showMessage(i18n.showMessage15);
                        return;
                    }
                    isSyncing = true;
                    try {
                        // 手动同步：复制一份本地快照，避免同步过程中 UI 状态变化带来来源不一致
                        const notebooksSnapshot = notebooksList.map(item => ({ ...item }));
                        await syncWereadNotes(plugin, cookies, false, undefined, "ui-cache-only", notebooksSnapshot);
                    } finally {
                        isSyncing = false;
                    }
                }}>{i18n.syncAll}</button
            >
            <button
                disabled={!checkMessage.includes("✅") || isNotebookListLoading || !isNotebookListReady || isSyncing}
                on:click={async () => {
                    if (isSyncing) return;
                    if (!checkMessage.includes("✅")) {
                        showMessage(i18n.showMessage15);
                        return;
                    }
                    isSyncing = true;
                    try {
                        // 手动同步：复制一份本地快照，避免同步过程中 UI 状态变化带来来源不一致
                        const notebooksSnapshot = notebooksList.map(item => ({ ...item }));
                        await syncWereadNotes(plugin, cookies, true, undefined, "ui-cache-only", notebooksSnapshot);
                    } finally {
                        isSyncing = false;
                    }
                }}>{i18n.updateSync}</button
            >
            <label>
                <input
                    type="checkbox"
                    title={i18n.autoSyncTip}
                    bind:checked={autoSync}
                    on:change={async () => {
                        await plugin.saveData("weread_settings", { autoSync });
                    }}
                />
                {i18n.autoSync}
            </label>
        </div>
        {#if isSyncing}
            <div class="syncing-notice">
                <span class="syncing-title">⏳ {i18n.syncing}</span>
                <span class="tip">{i18n.syncingTip}</span>
            </div>
        {/if}
    {/if}
</div>
