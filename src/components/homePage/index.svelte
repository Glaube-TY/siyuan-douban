<script lang="ts">
    import { onMount } from "svelte";
    import { I18N, showMessage, fetchPost } from "siyuan";
    import { sql } from "../../api";
    import { fetchDoubanBook, fetchBookHtml } from "../../utils/douban/book";
    import "../styles/main.scss";
    import { loadAVData } from "../../utils/bookHandling";
    import SearchBookDialog from "../common/searchBookDialog.svelte";

    export let app;
    export let i18n: I18N;
    export let plugin;

    let inputVales = "";
    let bookInfo: BookInfo | null = null;
    let statusMessage = "";
    let addNotes1 = true;

    let customRatings = [];
    let customCategories = [];
    let customReadingStatuses = [];
    let tempRatings = "";
    let tempCategories = "";
    let tempStatuses = "";

    let bookDatabassID = "";
    let databaseStatusMessage = "";
    let avID = "";

    let myRatingIndex = 0;
    let bookCategoryIndex = 0;
    let readingStatusIndex = 0;

    let showTemplateEditor = false;
    let noteTemplate = "";
    let originalTemplate = "";

    let showSearchDialog = false;
    let searchKeyword = "";
    let bookHtml = "";
    let webviewRef: any;

    const tabs = ["📚 书籍查询", "⚙️ 用户设置", "ℹ️ 关于插件"];
    let activeTab = tabs[0];

    interface BookInfo {
        title: string;
        subtitle?: string;
        authors: string[];
        translators: string[];
        isbn: string;
        publisher?: string;
        publishDate?: string;
        pages?: string;
        price?: string;
        originalTitle?: string;
        binding?: string;
        series?: string;
        producer?: string;
        rating?: string;
        ratingCount?: string;
        cover?: string;
        myRating?: string;
        bookCategory?: string;
        readingStatus?: string;
        startDate?: string;
        finishDate?: string;
        addNotes?: boolean;
    }

    async function fetchBookData() {
        try {
            // 检查空值
            if (!inputVales) {
                throw new Error("输入不能为空");
            }

            // 新增ISBN格式判断
            const isISBN = /^(97(8|9))?\d{9}(\d|X)$/.test(inputVales);

            if (isISBN) {
                // ISBN 模式：获取页面并解析
                const html = await fetchBookHtml(inputVales);
                bookInfo = await fetchDoubanBook(html);
                bookInfo.addNotes = addNotes1;
                inputVales = bookInfo.isbn;
            } else {
                // 书名搜索模式：打开搜索弹窗
                searchKeyword = encodeURIComponent(inputVales);
                showSearchDialog = true;
            }
        } catch (error) {
            statusMessage = error.message || "未知错误，请检查控制台";
            console.error("书籍获取失败:", error);
        }
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Enter") fetchBookData();
    }

    async function validateDatabaseID() {
        if (!bookDatabassID) {
            showMessage("⚠️ 请输入数据库块ID", 3000); // 新增空值提示
            return;
        }

        try {
            databaseStatusMessage = "验证数据库中...";
            const query = `SELECT * FROM blocks WHERE id = "${bookDatabassID}"`;
            const result = await sql(query);

            if (result.length === 0 || !result[0]?.markdown) {
                throw new Error("未找到对应的数据库块");
            }

            const avDivMatch = result[0].markdown.match(/data-av-id="([^"]+)"/);
            if (!avDivMatch) {
                throw new Error("该块不是有效的属性视图数据库块");
            }

            // 保存真实数据库ID
            avID = avDivMatch[1];
            databaseStatusMessage = "数据库验证通过 ✅";
        } catch (error) {
            showMessage(`❌ 数据库验证失败: ${error.message}`, 5000);
            databaseStatusMessage = `验证失败: ${error.message}`;
            bookDatabassID = "";
            avID = ""; // 清空真实ID
        }
    }

    onMount(() => {
        const savedISBN = localStorage.getItem("lastISBN");
        if (savedISBN) inputVales = savedISBN;

        plugin.loadData("settings.json").then(async (savedSettings) => {
            if (savedSettings) {
                noteTemplate = savedSettings.noteTemplate || ``;
                customRatings = savedSettings.ratings || [
                    "⭐",
                    "⭐⭐",
                    "⭐⭐⭐",
                ];
                customCategories = savedSettings.categories || ["默认分类"];
                customReadingStatuses = savedSettings.statuses || [
                    "未读",
                    "已读",
                ];
                addNotes1 = savedSettings.addNotes ?? true;
                bookDatabassID = savedSettings.bookDatabaseID || "";

                tempRatings = customRatings.join(", ");
                tempCategories = customCategories.join(", ");
                tempStatuses = customReadingStatuses.join(", ");

                if (bookDatabassID) {
                    await validateDatabaseID();
                }
            }
        });
    });
</script>

<div class="tab-container">
    <ul class="tab-nav">
        {#each tabs as tab}
            <button
                class:active={tab === activeTab}
                role="tab"
                tabindex="0"
                on:click={() => (activeTab = tab)}
                on:keydown={(e) => e.key === "Enter" && (activeTab = tab)}
            >
                {tab}
            </button>
        {/each}
    </ul>

    <!-- 内容区域 -->
    <div class="tab-content">
        <!-- 第一个标签页 - 书籍查询 -->
        {#if activeTab === tabs[0]}
            <div class="b3-dialog__content book-info">
                <div class="input-group">
                    <input
                        type="text"
                        bind:value={inputVales}
                        placeholder="输入书名或ISBN号（回车确认）"
                        on:keydown={handleKeyDown}
                        style="width: 15em; min-width: 10em;"
                    />
                    <button
                        on:click={fetchBookData}
                        style="justify-content: center;">🔍查询</button
                    >
                    <div
                        class="waiting"
                        style="text-align: center; justify-content: center; items: center;"
                    >
                        <div class="loading-spinner">{statusMessage}</div>
                    </div>
                    <div class="action-buttons">
                        <button
                            class="primary"
                            on:click={async () => {
                                if (!bookInfo) return;

                                const fullData = {
                                    ...bookInfo,
                                    ISBN: inputVales,
                                    databaseBlockId: bookDatabassID,
                                    myRating:
                                        customRatings[myRatingIndex] ||
                                        "未评分",
                                    bookCategory:
                                        customCategories[bookCategoryIndex] ||
                                        "默认分类",
                                    readingStatus:
                                        customReadingStatuses[
                                            readingStatusIndex
                                        ] || "未读",
                                    startDate: bookInfo.startDate || "",
                                    finishDate: bookInfo.finishDate || "",
                                    publishDate: bookInfo.publishDate || "",
                                    addNotes: bookInfo.addNotes,
                                    noteTemplate: noteTemplate,
                                };

                                const result = await loadAVData(avID, fullData);
                                if (result) {
                                    showMessage(
                                        `❌ 保存失败: ${result.msg}`,
                                        5000,
                                    );
                                } else {
                                    showMessage(
                                        `✅《${bookInfo.title}》已加入书库`,
                                        3000,
                                    );
                                    await fetchPost(
                                        "/api/ui/reloadAttributeView",
                                        { id: avID },
                                    );
                                }
                            }}
                        >
                            ✅添加书籍
                        </button>
                    </div>
                </div>

                {#if bookInfo}
                    <div class="book-layout">
                        <div
                            class="loading-status"
                            style="color: var(--b3-theme-primary); padding: 10px;"
                        >
                            {#if !bookInfo.title}
                                正在解析书籍信息，请稍候...
                            {:else}
                                成功加载《{bookInfo.title}》的信息
                            {/if}
                        </div>
                        <!-- 上部区域 -->
                        <div class="book-top-area">
                            <!-- 封面列 -->
                            <div class="cover-column" style="center">
                                {#if bookInfo.cover}
                                    <img
                                        src={bookInfo.cover}
                                        alt="书籍封面"
                                        class="book-cover"
                                    />
                                {/if}
                            </div>
                            <div class="info-column">
                                <div class="form-row">
                                    <label
                                        >书名：<input
                                            bind:value={bookInfo.title}
                                            style="width: 30em;"
                                        /></label
                                    >
                                </div>
                                <div class="form-row">
                                    <label
                                        >副标题：
                                        <input
                                            bind:value={bookInfo.subtitle}
                                            style="width: 29em;"
                                        />
                                    </label>
                                </div>
                                <div class="form-row">
                                    <label
                                        >原作名：
                                        <input
                                            bind:value={bookInfo.originalTitle}
                                            style="width: 29em;"
                                        />
                                    </label>
                                </div>

                                <div
                                    class="form-row"
                                    style="display: flex; gap: 20px; justify-content: space-between;"
                                >
                                    <div style="flex: 1;">
                                        <label
                                            >作者：<input
                                                bind:value={bookInfo.authors}
                                                style="flex: 1;"
                                            /></label
                                        >
                                    </div>
                                    <div>
                                        <label
                                            >译者：<input
                                                bind:value={
                                                    bookInfo.translators
                                                }
                                                style="width: 10em; min-width: 0;"
                                            /></label
                                        >
                                    </div>
                                </div>
                                <div
                                    class="form-row"
                                    style="display: flex; gap: 1em; justify-content: space-between;"
                                >
                                    <div style="flex: 1;">
                                        <label
                                            >出版社：<input
                                                bind:value={bookInfo.publisher}
                                                style="flex: 1;"
                                            /></label
                                        >
                                    </div>
                                    <div>
                                        <label
                                            >出版年：<input
                                                bind:value={
                                                    bookInfo.publishDate
                                                }
                                                style="width: 9em; min-width: 0;"
                                            /></label
                                        >
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 中上区域 -->
                        <div class="book-middle-up-area">
                            <div
                                class="form-row"
                                style="display: flex; justify-content: space-between; gap: 1em;"
                            >
                                <div>
                                    <label
                                        >出品方：<input
                                            bind:value={bookInfo.producer}
                                            style="width: 18em; min-width: 0;"
                                        /></label
                                    >
                                </div>
                                <div>
                                    <label
                                        >丛书：<input
                                            bind:value={bookInfo.series}
                                            style="width: 18em; min-width: 0;"
                                        /></label
                                    >
                                </div>
                            </div>

                            <div
                                class="form-row"
                                style="display: flex; justify-content: space-between; gap: 1em;"
                            >
                                <div>
                                    <label
                                        >豆瓣评分：<input
                                            bind:value={bookInfo.rating}
                                            style="width: 3em; min-width: 0;"
                                        /></label
                                    >
                                </div>
                                <div>
                                    <label
                                        >评分人数：<input
                                            bind:value={bookInfo.ratingCount}
                                            style="width: 3em; min-width: 0;"
                                        /></label
                                    >
                                </div>
                                <div>
                                    <label
                                        >定价：<input
                                            bind:value={bookInfo.price}
                                            style="width: 3em; min-width: 0;"
                                        /></label
                                    >
                                </div>
                                <div class="form-row">
                                    <label
                                        >装帧：<input
                                            bind:value={bookInfo.binding}
                                            style="width: 3em; min-width: 0;"
                                        /></label
                                    >
                                </div>
                                <div>
                                    <label
                                        >页数：<input
                                            bind:value={bookInfo.pages}
                                            style="width: 3em; min-width: 0;"
                                        /></label
                                    >
                                </div>
                            </div>
                        </div>

                        <!-- 中下部区域 -->
                        <div class="book-middle-down-area">
                            <div
                                class="form-row"
                                style="display: flex; gap: 1em; justify-content: space-between;"
                            >
                                <div>
                                    <label>
                                        我的评分：
                                        <select bind:value={myRatingIndex}>
                                            {#each customRatings as rating, index}
                                                <option value={index}
                                                    >{rating}</option
                                                >
                                            {/each}
                                        </select>
                                    </label>
                                </div>
                                <div>
                                    <label>
                                        书籍分类：
                                        <select bind:value={bookCategoryIndex}>
                                            {#each customCategories as category, index}
                                                <option value={index}
                                                    >{category}</option
                                                >
                                            {/each}
                                        </select>
                                    </label>
                                </div>
                                <div>
                                    <label>
                                        阅读状态：
                                        <select bind:value={readingStatusIndex}>
                                            {#each customReadingStatuses as status, index}
                                                <option value={index}
                                                    >{status}</option
                                                >
                                            {/each}
                                        </select>
                                    </label>
                                </div>
                                <div>
                                    <label>
                                        <input
                                            type="checkbox"
                                            bind:checked={bookInfo.addNotes}
                                        />是否生成读书笔记
                                    </label>
                                </div>
                            </div>

                            <div
                                class="form-row"
                                style="display: flex; gap: 1em; justify-content: space-between;"
                            >
                                <div>
                                    <label>
                                        开始日期：
                                        <input
                                            type="date"
                                            bind:value={bookInfo.startDate}
                                        />
                                    </label>
                                </div>
                                <div>
                                    <label>
                                        读完日期：
                                        <input
                                            type="date"
                                            bind:value={bookInfo.finishDate}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        {:else if activeTab === tabs[1]}
            <!-- 第二个标签页 - 用户设置 -->
            <div class="settings">
                <h3>书籍数据库块ID</h3>
                <div class="form-row">
                    <input
                        type="text"
                        bind:value={bookDatabassID}
                        placeholder="请输入书籍数据库块ID"
                    />
                </div>
                <div class="database-status" style="padding-bottom: 10px;">
                    {databaseStatusMessage}
                </div>
                <h3>偏好设置</h3>
                <div class="form-row custom-options">
                    <label
                        >评分等级（逗号分隔）：<input
                            bind:value={tempRatings}
                        /></label
                    >
                </div>
                <div class="form-row custom-options">
                    <label
                        >书籍分类（逗号分隔）：<input
                            bind:value={tempCategories}
                        /></label
                    >
                </div>
                <div class="form-row custom-options">
                    <label
                        >阅读状态（逗号分隔）：<input
                            bind:value={tempStatuses}
                        /></label
                    >
                </div>
                <div class="form-row">
                    <label
                        style="display: inline-flex; align-items: center; gap: 5px;"
                    >
                        <input
                            type="checkbox"
                            bind:checked={addNotes1}
                            style="margin-right: 5px;"
                        />默认生成读书笔记</label
                    >
                    <button
                        class="b3-button"
                        on:click={() => {
                            originalTemplate = noteTemplate;
                            showTemplateEditor = true;
                        }}
                        style="margin-left: 12px; padding: 8px 12px; font-size: 14px;"
                        >📝 设置模板</button
                    >
                </div>
                <button
                    class="primary"
                    on:click={async () => {
                        // 将临时变量转换为数组
                        customRatings = tempRatings
                            .split(/[，,]/)
                            .map((s) => s.trim());
                        customCategories = tempCategories
                            .split(/[，,]/)
                            .map((s) => s.trim());
                        customReadingStatuses = tempStatuses
                            .split(/[，,]/)
                            .map((s) => s.trim());

                        try {
                            await plugin.saveData("settings.json", {
                                ratings: customRatings,
                                categories: customCategories,
                                statuses: customReadingStatuses,
                                addNotes: addNotes1,
                                bookDatabaseID: bookDatabassID,
                                noteTemplate: noteTemplate, // 新增模板字段
                            });
                            showMessage("✅ 设置保存成功", 3000);
                            await validateDatabaseID();
                        } catch (error) {
                            showMessage(
                                `❌ 设置保存失败: ${error.message}`,
                                5000,
                            );
                        }
                    }}>保存设置</button
                >
            </div>
        {:else}
            <!-- 第三个标签页 - 关于插件 -->
            <div class="about">
                <div class="about-header">
                    <h3>📚 豆瓣书籍插件</h3>
                    <p class="motto">让阅读管理更优雅</p>
                </div>

                <div class="about-grid">
                    <div class="about-card">
                        <span class="icon">🌐</span>
                        <div>
                            <p class="label">插件主页：</p>
                            <a
                                href="https://github.com/Glaube-TY/siyuan-douban"
                                class="link">siyuan-douban</a
                            >
                        </div>
                        <span class="icon">&nbsp;&nbsp;&nbsp;</span>
                        <span class="icon">📜</span>
                        <div>
                            <p class="label">插件教程：</p>
                            <a
                                href="https://ttl8ygt82u.feishu.cn/wiki/VZdjwDNxWi4j0jkdyxMcOg2VnFf"
                                class="link">飞书文档（主要）</a
                            >
                            <p>
                                <a
                                    href="https://cooperative-ferry-4dc.notion.site/SY-1e3c50d8b56c809bae91e6e059c87e82"
                                    class="link">Notion（辅助）</a
                                >
                            </p>
                        </div>
                    </div>

                    <div class="about-card">
                        <span class="icon">👨</span>
                        <div>
                            <p class="label">开发者：Glaube-TY</p>
                            <a href="https://github.com/Glaube-TY" class="link"
                                >Github 主页</a
                            >
                            <p>
                                <a
                                    href="https://ld246.com/member/GlaubeTY"
                                    class="link">链滴主页</a
                                >
                            </p>
                        </div>
                        <span class="icon">&nbsp;&nbsp;&nbsp;</span>
                        <span class="icon">📊</span>
                        <div>
                            <p class="label">数据来源：</p>
                            <a href="https://book.douban.com/" class="link"
                                >豆瓣读书</a
                            >
                        </div>
                    </div>

                    <div class="about-card">
                        <span class="icon">💖</span>
                        <div>
                            <p class="label">支持开发者：</p>
                            <a
                                href="https://ttl8ygt82u.feishu.cn/wiki/VZdjwDNxWi4j0jkdyxMcOg2VnFf?from=from_copylink"
                                class="link">🌹 请作者喝咖啡</a
                            >
                        </div>
                        <span class="icon">&nbsp;&nbsp;&nbsp;</span>
                        <span class="icon">⁉</span>
                        <div>
                            <p class="label">反馈&建议：</p>
                            <a
                                href="https://github.com/Glaube-TY/siyuan-douban/issues"
                                class="link">Github Issues</a
                            >
                            <p>
                                <a
                                    href="https://pd.qq.com/s/724c4lpoc"
                                    class="link">腾讯频道</a
                                >
                            </p>
                        </div>
                    </div>
                </div>

                <div class="about-footer">
                    <p>
                        ❤
                        由一位热爱阅读的开发者制作，希望为你带来更好的知识管理体验
                    </p>
                </div>
            </div>
        {/if}
    </div>
</div>

{#if showTemplateEditor}
    <div class="b3-dialog-container" style="z-index: 9999;">
        <div
            class="b3-dialog-scrim"
            role="button"
            tabindex="0"
            on:click|self={() => (showTemplateEditor = false)}
            on:keydown={(e) =>
                (e.key === "Enter" || e.key === " ") &&
                (showTemplateEditor = false)}
        ></div>
        <div class="b3-dialog-card">
            <div class="b3-dialog__header" role="heading" aria-level="2">
                <div
                    style="display: flex; justify-content: space-between; align-items: center; width: 100%;"
                >
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>📝</span>
                        <p class="b3-dialog__title">自定义读书笔记模板</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button
                            class="b3-button dialog-btn"
                            on:click={() => {
                                noteTemplate = originalTemplate; // 恢复原始模板
                                showTemplateEditor = false;
                            }}>取消</button
                        >
                        <button
                            class="b3-button dialog-btn primary-btn"
                            on:click={async () => {
                                try {
                                    // 获取当前设置并更新模板
                                    const currentSettings =
                                        (await plugin.loadData(
                                            "settings.json",
                                        )) || {};
                                    currentSettings.noteTemplate = noteTemplate;

                                    // 保存更新后的设置
                                    await plugin.saveData(
                                        "settings.json",
                                        currentSettings,
                                    );
                                    originalTemplate = noteTemplate; // 更新暂存副本
                                    showTemplateEditor = false;
                                    showMessage("✅ 模板保存成功", 3000);
                                } catch (error) {
                                    showMessage(
                                        `❌ 模板保存失败: ${error.message}`,
                                        5000,
                                    );
                                }
                            }}>保存模板</button
                        >
                    </div>
                </div>
            </div>
            <div class="b3-dialog__body">
                <textarea
                    bind:value={noteTemplate}
                    style="width: calc(100% - 32px);
                          height: 340px;
                          margin: 0 16px 16px 16px;
                          padding: 12px;
                          font-family: monospace;
                          border: 1px solid var(--b3-theme-divider);
                          border-radius: 4px;
                          background-color: var(--b3-theme-background);
                          color: var(--b3-theme-text);
                          transition: background-color 0.2s ease;
                          box-sizing: border-box;"
                    placeholder="在此输入你的笔记模板..."
                ></textarea>
            </div>
        </div>
    </div>
{/if}

<SearchBookDialog
    bind:showSearchDialog
    bind:searchKeyword
    bind:webviewRef
    on:close={() => (showSearchDialog = false)}
    on:select={async ({ detail: html }) => {
        try {
            bookInfo = await fetchDoubanBook(html);
            bookInfo.addNotes = addNotes1;
            inputVales = bookInfo.isbn;
            showMessage(`✅ 成功获取《${bookInfo.title}》的信息`, 3000);
        } catch (error) {
            showMessage(`❌ 解析失败: ${error.message}`, 5000);
            console.error("书籍解析失败:", error);
        }
    }}
/>
