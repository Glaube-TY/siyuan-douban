<script lang="ts">
    import { onMount } from "svelte";
    import { I18N, showMessage, fetchPost } from "siyuan";
    import { sql } from "./api";
    import { fetchDoubanBook } from "./fetchDouban";
    import "./homePage.scss";
    import { loadAVData } from "./addBook";

    export let app;
    export let i18n: I18N;
    export let plugin;

    let isbnInput = "";
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

    let myRatingIndex = 0; // 新增索引变量
    let bookCategoryIndex = 0;
    let readingStatusIndex = 0;

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
            if (!isbnInput) {
                throw new Error("ISBN号不能为空");
            }

            // 格式校验
            if (!/^(97(8|9))?\d{9}(\d|X)$/.test(isbnInput)) {
                throw new Error("ISBN格式不正确");
            }

            try {
                statusMessage = "获取书籍信息中...";
                bookInfo = await fetchDoubanBook(isbnInput).catch(e => {
                    throw new Error(`豆瓣接口访问失败: ${e.message}`);
                });

                // 数据完整性检查
                if (!bookInfo?.title) {
                    throw new Error("获取的书籍数据不完整");
                }

                // 处理数据
                bookInfo.isbn = isbnInput;

                // 存储数据
                try {
                    localStorage.setItem(
                        `book-${isbnInput}`,
                        JSON.stringify(bookInfo),
                    );
                } catch (storageError) {
                    console.error("本地存储失败:", storageError);
                    throw new Error("数据保存失败，请检查存储空间");
                }

                statusMessage = "";
            } catch (apiError) {
                throw new Error(`数据获取失败: ${apiError.message}`);
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
        if (savedISBN) isbnInput = savedISBN;

        plugin.loadData("settings.json").then(async (savedSettings) => {
            if (savedSettings) {
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
                        bind:value={isbnInput}
                        placeholder="输入ISBN号（回车确认）"
                        on:keydown={handleKeyDown}
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
                                    ISBN: isbnInput,
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
                                    addNotes: bookInfo.addNotes ?? addNotes1,
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
                                <!-- <div>
                                    <label>
                                        <input
                                            type="checkbox"
                                            bind:checked={bookInfo.addNotes}
                                        />是否生成读书笔记
                                    </label>
                                </div> -->
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
                        placeholder="请输入豆瓣书籍数据库块ID"
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
                <!-- <div class="form-row">
                    <label
                        >默认生成读书笔记：<input
                            type="checkbox"
                            bind:checked={addNotes1}
                        /></label
                    >
                </div> -->
                <button
                    class="primary"
                    on:click={async () => {
                        // 将临时变量转换为数组
                        customRatings = tempRatings
                            .split(/[，,]/) // 修改为同时匹配中英文逗号
                            .map((s) => s.trim());
                        customCategories = tempCategories
                            .split(/[，,]/) // 修改为同时匹配中英文逗号
                            .map((s) => s.trim());
                        customReadingStatuses = tempStatuses
                            .split(/[，,]/) // 修改为同时匹配中英文逗号
                            .map((s) => s.trim());

                        try {
                            await plugin.saveData("settings.json", {
                                ratings: customRatings,
                                categories: customCategories,
                                statuses: customReadingStatuses,
                                addNotes: addNotes1,
                                bookDatabaseID: bookDatabassID,
                            });
                            showMessage("✅ 设置保存成功", 3000);
                            await validateDatabaseID();
                        } catch (error) {
                            showMessage(
                                `❌ 设置保存失败: ${error.message}`,
                                5000,
                            );
                        }
                    }}>保存自定义选项</button
                >
            </div>
        {:else}
            <!-- 第三个标签页 - 关于插件 -->
            <div class="about">
                <div class="about-header">
                    <h3>📚 豆瓣书籍插件 v1.0.3</h3>
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
                        <span class="icon">✒</span>
                        <div>
                            <p class="label">插件教程：</p>
                            <a
                                href="https://cooperative-ferry-4dc.notion.site/SY-1e3c50d8b56c809bae91e6e059c87e82"
                                class="link">插件教程</a
                            >
                        </div>
                    </div>

                    <div class="about-card">
                        <span class="icon">👨💻</span>
                        <div>
                            <p class="label">开发者：</p>
                            <a href="https://github.com/Glaube-TY" class="link"
                                >Glaube-TY</a
                            >
                            <p>
                                <a
                                    href="https://cooperative-ferry-4dc.notion.site/Glaube-TY-1d9c50d8b56c80fdb67aefe123efb849"
                                    class="link">Glaube-TY 个人主页</a
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
                                href="https://cooperative-ferry-4dc.notion.site/SY-1e3c50d8b56c809bae91e6e059c87e82"
                                class="link">🌹 请作者喝咖啡</a
                            >
                        </div>
                        <span class="icon">&nbsp;&nbsp;&nbsp;</span>
                        <span class="icon">⁉</span>
                        <div>
                            <p class="label">反馈&建议：</p>
                            <a
                                href="https://github.com/Glaube-TY/siyuan-douban/issues"
                                class="link">反馈地址1</a
                            >
                            <p>
                                <a
                                    href="https://pd.qq.com/s/724c4lpoc"
                                    class="link">反馈地址2</a
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
