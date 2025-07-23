<script lang="ts">
    import { showMessage } from "siyuan";
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
                    checkMessage = "登录已过期，正在更新登录信息……";
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
                截止<span class="time">${latestSyncTime}</span>
            </div>
            <div class="summary-info">
                你在<span class="count">${notebookdata.totalBookCount}</span>本书中做了<span class="count">${totalNotes}</span>条笔记~
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

            const showDialog = createBookShelfDialog(shelfList);
            showDialog();
        } catch (error) {
            console.error("获取书架信息失败", error);
            showMessage("❌ 获取书架信息失败，请检查网络或Cookie有效性");
        } finally {
            loadingBookShelf = false;
        }
    }

    async function createManageISBNDialog() {
        const customISBNBooks = await plugin.loadData("weread_customBooksISBN");

        if (customISBNBooks.length === 0) {
            showMessage("❌ 未找到自定义 ISBN 书籍");
            return;
        }

        const dialog = svelteDialog({
            title: "自定义ISBN书籍管理",
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
            showMessage("❌ 未找到已忽略的书籍");
            return;
        }

        const dialog = svelteDialog({
            title: "忽略书籍管理",
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
    <p>v2.3.0 中书评 globalComments 变量格式有变化</p>
    <label for="tutorial"
        >使用前请先看教程：<a
            id="tutorial"
            href="https://ttl8ygt82u.feishu.cn/wiki/TVR2wczSKiy2HSk7PyQcMGuNnyc"
            >微信读书笔记同步教程</a
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
            }}>扫码登录</button
        >
        <button
            on:click={createWereadDialog(cookies, (newCookies) => {
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
            })}>填写 Cookie</button
        >
        {#if isChecking}
            <span class="checking">⌛ 正在验证...</span>
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
                        <button on:click={createNotebooksDialog(notebooksList)}
                            >有笔记书籍</button
                        >
                        <button on:click={openBookShelf}>书架图书</button>
                    {/if}
                </div>
                {#if loadingBookShelf}
                    <div class="loading-notice">⌛ 正在加载书架信息...</div>
                {/if}
            {:else}
                <div class="loading-notice">⌛ 正在获取书籍信息，请稍候...</div>
                <div class="loading-notice">
                    （若书籍比较多，所需时间会加长）
                </div>
            {/if}
        {:else}
            <div class="cookie-warning">
                🔑 请先填写有效的微信读书Cookie以查看书籍信息
            </div>
        {/if}
    </div>
    <div class="weread-custom-books">
        <button on:click={createManageISBNDialog}>管理自定义ISBN书籍</button>
        <button on:click={createIgnoredBooksDialog}>管理忽略书籍</button>
    </div>
    <div class="weread-notes-template">
        <button
            on:click={createWereadNotesTemplateDialog((newWereadTemplates) => {
                wereadTemplates = newWereadTemplates;
                plugin.saveData("weread_templates", newWereadTemplates);
            }, wereadTemplates)}>设置模板</button
        >
        <label title="同步的微信读书笔记位于位置标记之后"
            >位置标记：
            <input type="text" bind:value={wereadPositionMark} />
        </label>
        <button
            on:click={async () => {
                await plugin.saveData(
                    "weread_position_mark",
                    wereadPositionMark,
                );
                showMessage("保存成功！");
            }}
        >
            确定
        </button>
    </div>
    <div class="sync-setting">
        <button
            disabled={!notebooksInfo}
            on:click={async () => {
                if (!checkMessage.includes("✅")) {
                    showMessage("❌请先填写有效的微信读书 Cookie 再进行同步");
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
                    showMessage("❌请先填写有效的微信读书 Cookie 再进行同步");
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
                title="是否启动软件自动同步"
                bind:checked={autoSync}
                on:change={() => {
                    plugin.saveData("weread_settings", { autoSync });
                }}
            />
            启动同步
        </label>
    </div>
    {#if isSyncing}
        <div class="syncing-notice">
            <span class="syncing-title">⏳ 正在同步微信读书笔记...</span>
            <span class="tip">（若书籍比较多，所需时间会加长）</span>
        </div>
    {/if}
</div>
