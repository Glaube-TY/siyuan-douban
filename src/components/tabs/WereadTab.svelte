<script lang="ts">
    import { showMessage, I18N } from "siyuan";
    import { onMount } from "svelte";
    import { svelteDialog } from "@/libs/dialog";
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
    import { syncWereadNotes } from "@/utils/weread/syncWereadNotes";

    import wereadManageISBN from "@/components/common/wereadManageISBN.svelte";
    import wereadIgnoredBooksDialog from "@/components/common/wereadIgnoredBooksDialog.svelte";

    export let i18n: I18N;
    export let plugin: any;
    export let cookies = "";

    export let wereadTemplates = "";
    export let wereadPositionMark = "";

    let autoSync = false;
    let isSyncing = false;
    let userVid = "";
    let isChecking = false;
    let checkMessage = "";
    let notebookdata: any = "";

    let latestSyncTime = "";
    let notebooksInfo = "";
    let notebooksList = [];
    let loadingBookShelf = false;

    onMount(async () => {
        const savedCookie = await plugin.loadData("weread_cookie");
        wereadPositionMark = await plugin.loadData("weread_position_mark");
        const wereadSetting = await plugin.loadData("weread_settings");

        autoSync = wereadSetting.autoSync;

        if (savedCookie) {
            cookies = savedCookie.cookies;
            const result = checkWrVid(cookies);
            userVid = result.userVid;
            checkMessage = `<span class="${result.checkMessage.includes("✅") ? "success" : "error"}">${result.checkMessage}</span>`;

            if (userVid) {
                isChecking = true;
                const verifyResult = await verifyCookie(
                    plugin,
                    cookies,
                    userVid,
                );
                checkMessage = verifyResult.message;

                if (verifyResult.loginDue) {
                    isChecking = false;
                    checkMessage = i18n.checkMessage1;
                    const autoCookies = await createWereadQRCodeDialog(false);
                    const savedata = {
                        cookies: autoCookies,
                        isQRCode: true,
                    };
                    plugin.saveData("weread_cookie", savedata);

                    const result = checkWrVid(autoCookies);
                    userVid = result.userVid;

                    if (userVid) {
                        isChecking = true;
                        verifyCookie(plugin, autoCookies, userVid).then(
                            (verifyResult) => {
                                checkMessage = verifyResult.message;
                                isChecking = false;
                            },
                        );
                    }
                }
                isChecking = false;
            }
        }

        const savedTemplates = await plugin.loadData("weread_templates");
        if (savedTemplates) {
            wereadTemplates = savedTemplates;
        }

        notebookdata = await getNotebooks(plugin, cookies);

        const syncDate = new Date(notebookdata.synckey * 1000);
        latestSyncTime = `${syncDate.toLocaleDateString()} ${syncDate.toLocaleTimeString()}`;

        const basicBooks = notebookdata.books;

        notebooksList = await Promise.all(
            basicBooks.map(async (b: any) => {
                const details = await getBook(plugin, cookies, b.bookId);
                return {
                    noteCount: b.noteCount,
                    reviewCount: b.reviewCount,
                    updatedTime: b.sort,
                    bookID: details.bookId,
                    title: details.title,
                    author: details.author || "未知作者",
                    cover: details.cover,
                    format: details.format === "epub" ? "电子书" : "纸质书",
                    price: details.price,
                    introduction: details.intro,
                    publishTime: details.publishTime,
                    category: details.category || "未分类",
                    isbn: details.isbn,
                    publisher: details.publisher || "未知出版社",
                    totalWords: details.totalWords,
                    star: details.newRating,
                    ratingCount: details.ratingCount,
                    AISummary: details.AISummary,
                };
            }),
        );

        await plugin.saveData("temporary_weread_notebooksList", notebooksList);

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
    });

    async function openBookShelf() {
        loadingBookShelf = true;
        try {
            const bookShelfInfo = await getBookShelf(plugin, cookies, userVid);
            const basicshelf = bookShelfInfo.books;

            const shelfList = await Promise.all(
                basicshelf.map(async (b: any) => {
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
                        author: details.author || "未知作者",
                        cover: details.cover,
                        format: details.format === "epub" ? "电子书" : "纸质书",
                        price: details.price,
                        introduction: details.intro,
                        publishTime: details.publishTime,
                        category: details.category || "未分类",
                        isbn: details.isbn,
                        publisher: details.publisher || "未知出版社",
                        totalWords: details.totalWords,
                        star: details.newRating,
                        ratingCount: details.ratingCount,
                        AISummary: details.AISummary,
                    };
                }),
            );

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
        const customISBNBooks = await plugin.loadData("weread_customBooksISBN");

        if (customISBNBooks.length === 0) {
            showMessage(i18n.showMessage12);
            return;
        }

        const dialog = svelteDialog({
            title: i18n.manageISBNDialogTitle,
            constructor: (containerEl: HTMLElement) => {
                return new wereadManageISBN({
                    target: containerEl,
                    props: {
                        plugin,
                        customISBNBooks: customISBNBooks,
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
        const ignoredBooks = await plugin.loadData("weread_ignoredBooks");

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
</script>

<div class="wereadSetting">
    <label for="tutorial"
        >{i18n.tutorial}:<a
            id="tutorial"
            href="https://ttl8ygt82u.feishu.cn/wiki/TVR2wczSKiy2HSk7PyQcMGuNnyc"
            >{i18n.tutorialLink}</a
        ></label
    >
    <div class="cookie-weread-setting">
        <button
            class="scan-qrcode"
            on:click={async () => {
                const autoCookies = await createWereadQRCodeDialog(true);
                const savedata = {
                    cookies: autoCookies,
                    isQRCode: true,
                };
                plugin.saveData("weread_cookie", savedata);

                const result = checkWrVid(autoCookies);
                userVid = result.userVid;

                if (userVid) {
                    isChecking = true;
                    verifyCookie(plugin, autoCookies, userVid).then(
                        (verifyResult) => {
                            checkMessage = verifyResult.message;
                            isChecking = false;
                        },
                    );
                }
            }}>{i18n.scanQRCodeLogin}</button
        >
        <button
            on:click={createWereadDialog(plugin, cookies, (newCookies) => {
                cookies = newCookies;
                const savedata = {
                    cookies: newCookies,
                    isQRCode: false,
                };
                plugin.saveData("weread_cookie", savedata);

                const result = checkWrVid(newCookies);
                userVid = result.userVid;
                checkMessage = `<span class="${result.checkMessage.includes("✅") ? "success" : "error"}">${result.checkMessage}</span>`;

                if (userVid) {
                    isChecking = true;
                    verifyCookie(plugin, newCookies, userVid).then(
                        (verifyResult) => {
                            checkMessage = verifyResult.message;
                            isChecking = false;
                        },
                    );
                }
            })}>{i18n.fillCookie}</button
        >
        {#if isChecking}
            <span class="checking">⌛ {i18n.checking}</span>
        {:else}
            {@html checkMessage}
        {/if}
    </div>
    <div class="weread-notebooks-info">
        {#if checkMessage.includes("✅")}
            {#if notebooksInfo}
                {@html notebooksInfo}
                <div class="booksinfo-button">
                    {#if notebooksList.length > 0}
                        <button on:click={createNotebooksDialog(plugin, notebooksList)}
                            >{i18n.hasNotesBooks}</button
                        >
                        <button on:click={openBookShelf}
                            >{i18n.bookShelf}</button
                        >
                    {/if}
                </div>
                {#if loadingBookShelf}
                    <div class="loading-notice">⌛ {i18n.loadingBookShelf}</div>
                {/if}
            {:else}
                <div class="loading-notice">⌛ {i18n.loadingBookInfo}</div>
                <div class="loading-notice">
                    ({i18n.loadingBookInfoTip})
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
    </div>
    <div class="weread-notes-template">
        <button
            on:click={createWereadNotesTemplateDialog(i18n, (newWereadTemplates) => {
                wereadTemplates = newWereadTemplates;
                plugin.saveData("weread_templates", newWereadTemplates);
            }, wereadTemplates)}>{i18n.setNotesTemplate}</button
        >
        <label title={i18n.notesSyncPositionTip}
            >{i18n.positionMark}:
            <input type="text" bind:value={wereadPositionMark} />
        </label>
        <button
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
    <div class="sync-setting">
        <button
            disabled={!notebooksInfo}
            on:click={async () => {
                if (!checkMessage.includes("✅")) {
                    showMessage(i18n.showMessage15);
                    return;
                }
                isSyncing = true;
                await syncWereadNotes(plugin, cookies, false);
                isSyncing = false;
            }}>全部同步</button
        >
        <button
            disabled={!notebooksInfo}
            on:click={async () => {
                if (!checkMessage.includes("✅")) {
                    showMessage(i18n.showMessage15);
                    return;
                }
                isSyncing = true;
                await syncWereadNotes(plugin, cookies, true);
                isSyncing = false;
            }}>更新同步</button
        >
        <label>
            <input
                type="checkbox"
                title={i18n.autoSyncTip}
                bind:checked={autoSync}
                on:change={() => {
                    plugin.saveData("weread_settings", { autoSync });
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
</div>
