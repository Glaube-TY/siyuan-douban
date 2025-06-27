<script lang="ts">
    import { showMessage } from "siyuan";
    import { onMount } from "svelte";
    import {
        createWereadDialog,
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

    export let plugin: any;
    export let cookies = "";
    let autoSync = false;
    export let wereadTemplates = "";
    export let wereadPositionMark = "";

    let wrVid = "";
    let userVid = "";
    let isChecking = false;
    let checkMessage = "";
    let notebookdata: any = "";

    let latestSyncTime = "";
    let notebooksInfo = "";
    let notebooksList = [];
    let bookShelfList = [];

    onMount(async () => {
        const savedCookie = await plugin.loadData("weread_cookie");
        wereadPositionMark = await plugin.loadData("weread_position_mark");
        const wereadSetting = await plugin.loadData("weread_settings");

        autoSync = wereadSetting.autoSync;

        if (savedCookie) {
            cookies = savedCookie;
            const result = checkWrVid(savedCookie);
            wrVid = result.wrVid;
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

        const totalNotes = notebooksList.reduce(
            (sum, book) => sum + book.noteCount,
            0,
        );

        const bookShelfInfo = await getBookShelf(plugin, cookies, userVid);
        const basicshelf = bookShelfInfo.books;
        bookShelfList = await Promise.all(
            basicshelf.map(async (b: any) => {
                const details = await getBook(plugin, cookies, b.bookId);
                return {
                    noteCount:
                        notebooksList.find((n) => n.bookID === details.bookId)
                            ?.noteCount || 0,
                    reviewCount:
                        notebooksList.find((n) => n.bookID === details.bookId)
                            ?.reviewCount || 0,
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

        notebooksInfo = `
            <div class="summary-info">
                截止<span class="time">${latestSyncTime}</span>
            </div>
            <div class="summary-info">
                您的微信读书书架上共有<span class="count">${bookShelfInfo.bookCount}</span>本书，
            </div>
            <div class="summary-info">
                并在<span class="count">${notebookdata.totalBookCount}</span>本书中做了<span class="count">${totalNotes}</span>条笔记~
            </div>
        `;
    });
</script>

<div class="wereadSetting">
    <p style="margin-bottom: 0.5rem;">
        该功能处于初步试用阶段，功能可能存在问题，建议先使用备用数据库测试。
    </p>
    <label for="tutorial" style="margin-bottom: 0.5rem;"
        >使用前请先看教程：<a
            id="tutorial"
            href="https://ttl8ygt82u.feishu.cn/wiki/TVR2wczSKiy2HSk7PyQcMGuNnyc"
            >微信读书笔记同步教程</a
        ></label
    >
    <div class="cookie-weread-setting">
        <button
            on:click={createWereadDialog(cookies, (newCookies) => {
                cookies = newCookies;
                plugin.saveData("weread_cookie", newCookies);

                const result = checkWrVid(newCookies);
                wrVid = result.wrVid;
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
        {@html notebooksInfo}
        <div class="booksinfo-button">
            {#if notebooksList.length > 0}
                <button on:click={createNotebooksDialog(notebooksList)}
                    >有笔记书籍</button
                >
            {/if}
            <button on:click={createBookShelfDialog(bookShelfList)}
                >书架图书</button
            >
        </div>
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
            on:click={async () => {
                await syncWereadNotes(plugin, cookies, false);
            }}>全部同步</button
        >
        <button
            on:click={async () => {
                await syncWereadNotes(plugin, cookies, true);
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
</div>
