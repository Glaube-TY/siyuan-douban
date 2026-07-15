<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { getImage } from "../../utils/core/getImg";

    export let bookInfo: any;
    export let customRatings: string[] = [];
    export let customCategories: string[] = [];
    export let customReadingStatuses: string[] = [];
    export let mobile = false;
    export let close: () => void = () => {};

    const dispatch = createEventDispatcher<{ confirm: any }>();

    let coverData = "";
    let showCover = false;
    let loadedCoverUrl = "";
    let isAdding = false;
    let myRatingIndex = 0;
    let bookCategoryIndex = 0;
    let readingStatusIndex = 0;

    async function loadCover(url: string) {
        loadedCoverUrl = url;
        coverData = String(await getImage(url));
        if (loadedCoverUrl === url) {
            showCover = !!coverData;
        }
    }

    $: if (bookInfo?.cover && bookInfo.cover !== loadedCoverUrl) {
        void loadCover(String(bookInfo.cover));
    } else if (!bookInfo?.cover) {
        loadedCoverUrl = "";
        coverData = "";
        showCover = false;
    }

    function handleCoverError() {
        showCover = false;
    }

    async function handleAdd() {
        if (!bookInfo) return;
        isAdding = true;
        try {
            dispatch("confirm", {
                ...bookInfo,
                myRating: customRatings[myRatingIndex] || "",
                bookCategory: customCategories[bookCategoryIndex] || "",
                readingStatus: customReadingStatuses[readingStatusIndex] || "",
                startDate: bookInfo.startDate || "",
                finishDate: bookInfo.finishDate || "",
                publishDate: bookInfo.publishDate || "",
            });
        } finally {
            isAdding = false;
        }
    }
</script>

<div class="douban-detail-dialog" class:douban-detail-dialog-mobile={mobile}>
    {#if mobile}
        <div class="douban-detail-body douban-detail-mobile-body">
            <section class="mobile-book-summary">
                {#if bookInfo?.cover && showCover}
                    <img src={coverData} alt="封面" class="mobile-book-cover" on:error={handleCoverError} />
                {:else}
                    <div class="mobile-book-cover mobile-book-cover-placeholder">暂无封面</div>
                {/if}
                <div class="mobile-book-identity">
                    <span>豆瓣图书</span>
                    <strong>{bookInfo.title || "未知书名"}</strong>
                    <em>{Array.isArray(bookInfo.authors) ? bookInfo.authors.join("、") : bookInfo.authors || "未知作者"}</em>
                    <small>{bookInfo.publisher || "出版社待补充"}{bookInfo.publishDate ? ` · ${bookInfo.publishDate}` : ""}</small>
                </div>
            </section>

            <details class="mobile-detail-section" open>
                <summary><span>基本信息</span><small>书名、作者与译者</small></summary>
                <div class="mobile-detail-fields">
                    <label><span>书名</span><input class="b3-text-field" bind:value={bookInfo.title} /></label>
                    <label><span>副标题</span><input class="b3-text-field" bind:value={bookInfo.subtitle} /></label>
                    <label><span>原作名</span><input class="b3-text-field" bind:value={bookInfo.originalTitle} /></label>
                    <label><span>作者</span><input class="b3-text-field" bind:value={bookInfo.authors} /></label>
                    <label><span>译者</span><input class="b3-text-field" bind:value={bookInfo.translators} /></label>
                </div>
            </details>

            <details class="mobile-detail-section">
                <summary><span>出版信息</span><small>评分、版本与装帧</small></summary>
                <div class="mobile-detail-fields mobile-detail-fields-grid">
                    <label class="mobile-field-wide"><span>出版社</span><input class="b3-text-field" bind:value={bookInfo.publisher} /></label>
                    <label><span>出版年</span><input class="b3-text-field" bind:value={bookInfo.publishDate} /></label>
                    <label><span>出品方</span><input class="b3-text-field" bind:value={bookInfo.producer} /></label>
                    <label class="mobile-field-wide"><span>丛书</span><input class="b3-text-field" bind:value={bookInfo.series} /></label>
                    <label><span>豆瓣评分</span><input class="b3-text-field" bind:value={bookInfo.rating} /></label>
                    <label><span>评分人数</span><input class="b3-text-field" bind:value={bookInfo.ratingCount} /></label>
                    <label><span>定价</span><input class="b3-text-field" bind:value={bookInfo.price} /></label>
                    <label><span>页数</span><input class="b3-text-field" bind:value={bookInfo.pages} /></label>
                    <label class="mobile-field-wide"><span>装帧</span><input class="b3-text-field" bind:value={bookInfo.binding} /></label>
                </div>
            </details>

            <details class="mobile-detail-section" open>
                <summary><span>我的阅读记录</span><small>分类、状态与日期</small></summary>
                <div class="mobile-note-toggle">
                    <span><strong>生成读书笔记</strong><small>添加书籍后创建对应笔记文档</small></span>
                    <input type="checkbox" bind:checked={bookInfo.addNotes} />
                </div>
                <div class="mobile-detail-fields">
                    <label><span>我的评分</span><select class="b3-select" bind:value={myRatingIndex}>{#each customRatings as rating, index}<option value={index}>{rating}</option>{/each}</select></label>
                    <label><span>书籍分类</span><select class="b3-select" bind:value={bookCategoryIndex}>{#each customCategories as category, index}<option value={index}>{category}</option>{/each}</select></label>
                    <label><span>阅读状态</span><select class="b3-select" bind:value={readingStatusIndex}>{#each customReadingStatuses as status, index}<option value={index}>{status}</option>{/each}</select></label>
                    <label><span>开始日期</span><input type="date" class="b3-text-field" bind:value={bookInfo.startDate} /></label>
                    <label><span>读完日期</span><input type="date" class="b3-text-field" bind:value={bookInfo.finishDate} /></label>
                </div>
            </details>

            <details class="mobile-detail-section">
                <summary><span>内容简介</span><small>展开查看和修改长文本</small></summary>
                <div class="mobile-detail-fields">
                    <label><span>书籍简介</span><textarea class="b3-text-field book-textarea" bind:value={bookInfo.description} rows="7"></textarea></label>
                    <label><span>作者简介</span><textarea class="b3-text-field book-textarea" bind:value={bookInfo.authorBio} rows="7"></textarea></label>
                </div>
            </details>
        </div>
    {:else}
    <div class="douban-detail-body">
        <div class="book-search-workspace">
            <div class="book-search-inner">
                <div class="book-form">
                    <div class="book-meta-card">
                        <div class="book-meta-top">
                            <div class="book-cover-panel">
                                {#if bookInfo?.cover && showCover}
                                    <img
                                        src={coverData}
                                        alt="封面"
                                        class="book-cover"
                                        on:error={handleCoverError}
                                    />
                                {:else}
                                    <div class="book-cover book-cover-placeholder">暂无封面</div>
                                {/if}
                                <label class="book-cover-note-toggle">
                                    <span>生成读书笔记</span>
                                    <input type="checkbox" class="book-note-checkbox" bind:checked={bookInfo.addNotes} />
                                </label>
                            </div>
                            <div class="book-title-panel">
                                <div class="field field-full">
                                    <label><span>书名</span><input class="b3-text-field" bind:value={bookInfo.title} /></label>
                                </div>
                                <div class="field field-full">
                                    <label><span>副标题</span><input class="b3-text-field" bind:value={bookInfo.subtitle} /></label>
                                </div>
                                <div class="field field-full">
                                    <label><span>原作名</span><input class="b3-text-field" bind:value={bookInfo.originalTitle} /></label>
                                </div>
                            </div>
                        </div>
                        <div class="book-meta-bottom">
                            <div class="field field-half">
                                <label><span>作者</span><input class="b3-text-field" bind:value={bookInfo.authors} /></label>
                            </div>
                            <div class="field field-half">
                                <label><span>译者</span><input class="b3-text-field" bind:value={bookInfo.translators} /></label>
                            </div>
                            <div class="field field-third">
                                <label><span>出版社</span><input class="b3-text-field" bind:value={bookInfo.publisher} /></label>
                            </div>
                            <div class="field field-third">
                                <label><span>出版年</span><input class="b3-text-field" bind:value={bookInfo.publishDate} /></label>
                            </div>
                            <div class="field field-third">
                                <label><span>出品方</span><input class="b3-text-field" bind:value={bookInfo.producer} /></label>
                            </div>
                            <div class="field field-half">
                                <label><span>丛书</span><input class="b3-text-field" bind:value={bookInfo.series} /></label>
                            </div>
                            <div class="field field-quarter">
                                <label><span>豆瓣评分</span><input class="b3-text-field" bind:value={bookInfo.rating} /></label>
                            </div>
                            <div class="field field-quarter">
                                <label><span>评分人数</span><input class="b3-text-field" bind:value={bookInfo.ratingCount} /></label>
                            </div>
                            <div class="field field-quarter">
                                <label><span>定价</span><input class="b3-text-field" bind:value={bookInfo.price} /></label>
                            </div>
                            <div class="field field-quarter">
                                <label><span>装帧</span><input class="b3-text-field" bind:value={bookInfo.binding} /></label>
                            </div>
                            <div class="field field-quarter">
                                <label><span>页数</span><input class="b3-text-field" bind:value={bookInfo.pages} /></label>
                            </div>
                        </div>
                    </div>

                    <div class="book-section">
                        <div class="book-section-title">个人记录</div>
                        <div class="book-info-grid">
                            <div class="field field-third">
                                <label>
                                    <span>我的评分</span>
                                    <select class="b3-select" bind:value={myRatingIndex}>
                                        {#each customRatings as rating, index}<option value={index}>{rating}</option>{/each}
                                    </select>
                                </label>
                            </div>
                            <div class="field field-third">
                                <label>
                                    <span>书籍分类</span>
                                    <select class="b3-select" bind:value={bookCategoryIndex}>
                                        {#each customCategories as category, index}<option value={index}>{category}</option>{/each}
                                    </select>
                                </label>
                            </div>
                            <div class="field field-third">
                                <label>
                                    <span>阅读状态</span>
                                    <select class="b3-select" bind:value={readingStatusIndex}>
                                        {#each customReadingStatuses as status, index}<option value={index}>{status}</option>{/each}
                                    </select>
                                </label>
                            </div>
                            <div class="field field-half">
                                <label><span>开始日期</span><input type="date" class="b3-text-field" bind:value={bookInfo.startDate} /></label>
                            </div>
                            <div class="field field-half">
                                <label><span>读完日期</span><input type="date" class="b3-text-field" bind:value={bookInfo.finishDate} /></label>
                            </div>
                        </div>
                    </div>

                    <div class="book-section">
                        <div class="book-section-title">书籍简介</div>
                        <textarea class="b3-text-field book-textarea" bind:value={bookInfo.description} rows="5"></textarea>
                    </div>

                    <div class="book-section">
                        <div class="book-section-title">作者简介</div>
                        <textarea class="b3-text-field book-textarea" bind:value={bookInfo.authorBio} rows="5"></textarea>
                    </div>
                </div>
            </div>
        </div>
    </div>
    {/if}

    <div class="douban-detail-footer">
        <button class="b3-button b3-button--outline" on:click={close}>取消</button>
        <button class="b3-button b3-button--primary" on:click={handleAdd} disabled={isAdding}>
            {isAdding ? "添加中..." : "添加书籍"}
        </button>
    </div>
</div>

<style>
    .douban-detail-dialog {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        overflow: hidden;
        box-sizing: border-box;
        color: var(--b3-theme-on-background);
    }

    .douban-detail-body {
        flex: 1 1 auto;
        height: 0;
        min-height: 0;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
    }

    .douban-detail-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid var(--b3-border-color);
        flex-shrink: 0;
    }

    /* 复用旧 _bookSearch.scss 的 book-search-workspace 结构 */
    .book-search-workspace {
        width: 100%;
        padding: 16px;
        box-sizing: border-box;
    }

    .book-search-inner {
        max-width: 720px;
        margin: 0 auto;
        width: 100%;
    }

    .book-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .book-meta-card {
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        overflow: hidden;
    }

    .book-meta-top {
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: 16px;
        padding: 16px;
    }

    .book-cover-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    .book-cover {
        width: 100%;
        height: auto;
        border-radius: 4px;
        object-fit: contain;
    }

    .book-cover-placeholder {
        display: grid;
        place-items: center;
        min-height: 160px;
        background: var(--b3-theme-surface);
        border: 1px dashed var(--b3-border-color);
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
    }

    .book-cover-note-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        white-space: nowrap;
    }

    .book-note-checkbox {
        width: 16px;
        height: 16px;
        padding: 0;
        margin: 0;
        flex: none;
    }

    .book-title-panel {
        display: flex;
        flex-direction: column;
        gap: 8px 12px;
    }

    .book-meta-bottom {
        display: grid;
        grid-template-columns: repeat(12, 1fr);
        gap: 8px 12px;
        padding: 16px;
        border-top: 1px solid var(--b3-border-color);
    }

    .book-section {
        padding: 16px;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
    }

    .book-section-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--b3-border-color);
    }

    .book-info-grid {
        display: grid;
        grid-template-columns: repeat(12, 1fr);
        gap: 8px 12px;
    }

    .field label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
    }

    .field label span {
        font-weight: 500;
    }

    .field-full { grid-column: span 12; }
    .field-half { grid-column: span 6; }
    .field-third { grid-column: span 4; }
    .field-quarter { grid-column: span 3; }

    /* 复用旧 _bookSearch.scss 的输入框样式 */
    .book-form :global(input:not([type="checkbox"])),
    .book-form :global(select),
    .book-form :global(textarea) {
        padding: 5px 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        font-size: 13px;
        width: 100%;
        box-sizing: border-box;
        transition: border-color 0.15s ease;
    }

    .book-form :global(input:not([type="checkbox"]):focus),
    .book-form :global(select:focus),
    .book-form :global(textarea:focus) {
        border-color: var(--b3-theme-primary);
        outline: none;
    }

    .book-textarea {
        resize: vertical;
        min-height: 110px;
        line-height: 1.5;
        font-family: inherit;
    }

    .douban-detail-dialog-mobile {
        background: var(--b3-theme-background);
    }

    .douban-detail-mobile-body {
        display: grid;
        align-content: start;
        gap: 12px;
        padding: 12px 12px 24px;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
    }

    .mobile-book-summary {
        display: grid;
        grid-template-columns: 82px minmax(0, 1fr);
        gap: 14px;
        align-items: center;
        padding: 14px;
        border-radius: 16px;
        background: linear-gradient(135deg, color-mix(in srgb, var(--b3-theme-primary) 14%, var(--b3-theme-surface)), var(--b3-theme-surface));
        border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 24%, var(--b3-border-color));
    }

    .mobile-book-cover {
        width: 82px;
        height: 112px;
        object-fit: cover;
        border-radius: 9px;
        background: var(--b3-theme-background);
        box-shadow: 0 8px 20px rgb(0 0 0 / 0.14);
    }

    .mobile-book-cover-placeholder {
        display: grid;
        place-items: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 11px;
        box-shadow: none;
    }

    .mobile-book-identity {
        display: grid;
        gap: 5px;
        min-width: 0;
    }

    .mobile-book-identity > span {
        color: var(--b3-theme-primary);
        font-size: 11px;
        font-weight: 700;
    }

    .mobile-book-identity strong {
        font-size: 19px;
        line-height: 1.3;
    }

    .mobile-book-identity em,
    .mobile-book-identity small {
        overflow: hidden;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
        font-style: normal;
        line-height: 1.45;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .mobile-detail-section {
        overflow: hidden;
        border: 1px solid var(--b3-border-color);
        border-radius: 14px;
        background: var(--b3-theme-surface);
    }

    .mobile-detail-section summary {
        display: grid;
        gap: 3px;
        padding: 14px 42px 14px 14px;
        cursor: pointer;
        list-style: none;
        position: relative;
    }

    .mobile-detail-section summary::-webkit-details-marker { display: none; }
    .mobile-detail-section summary::after {
        content: "⌄";
        position: absolute;
        top: 17px;
        right: 16px;
        color: var(--b3-theme-on-surface-light);
        transition: transform 0.18s ease;
    }
    .mobile-detail-section[open] summary::after { transform: rotate(180deg); }
    .mobile-detail-section summary span { font-size: 14px; font-weight: 700; }
    .mobile-detail-section summary small { color: var(--b3-theme-on-surface-light); font-size: 11px; }

    .mobile-detail-fields {
        display: grid;
        gap: 12px;
        padding: 0 14px 14px;
        border-top: 1px solid var(--b3-border-color);
        padding-top: 14px;
    }

    .mobile-detail-fields-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .mobile-field-wide { grid-column: 1 / -1; }
    .mobile-detail-fields label { display: grid; gap: 6px; min-width: 0; color: var(--b3-theme-on-surface); font-size: 12px; }
    .mobile-detail-fields input,
    .mobile-detail-fields select,
    .mobile-detail-fields textarea {
        width: 100%;
        min-height: 42px;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color);
        border-radius: 9px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        padding: 8px 10px;
        font: inherit;
    }

    .mobile-detail-fields textarea { min-height: 140px; }

    .mobile-note-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 0 14px 12px;
        padding: 12px;
        border-radius: 10px;
        background: var(--b3-theme-background);
    }

    .mobile-note-toggle > span { display: grid; gap: 3px; }
    .mobile-note-toggle strong { font-size: 13px; }
    .mobile-note-toggle small { color: var(--b3-theme-on-surface-light); font-size: 10px; }
    .mobile-note-toggle input { width: 22px; height: 22px; }

    .douban-detail-dialog-mobile .douban-detail-footer {
        padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
        background: color-mix(in srgb, var(--b3-theme-background) 92%, transparent);
        backdrop-filter: blur(14px);
    }

    .douban-detail-dialog-mobile .douban-detail-footer button {
        flex: 1;
        min-height: 44px;
        border-radius: 10px;
    }

    /* 小屏响应 */
    @media (max-width: 600px) {
        .book-meta-top {
            grid-template-columns: 1fr;
        }

        .book-cover-panel {
            width: 100%;
            display: flex;
            justify-content: center;
        }

        .book-cover {
            width: 120px;
        }

        .field-half,
        .field-third,
        .field-quarter {
            grid-column: span 12;
        }
    }
</style>
