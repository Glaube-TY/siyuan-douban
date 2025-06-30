<script lang="ts">
    import { createEventDispatcher } from "svelte";

    export let inputVales: string;
    export let bookInfo: any;
    export let statusMessage: string;
    export let customRatings: string[];
    export let customCategories: string[];
    export let customReadingStatuses: string[];
    export let myRatingIndex: number;
    export let bookCategoryIndex: number;
    export let readingStatusIndex: number;

    const dispatch = createEventDispatcher<{
        fetchBookData: void;
        addBook: void;
    }>();
</script>

<div class="b3-dialog__content book-info">
    <div class="input-group">
        <input
            type="text"
            bind:value={inputVales}
            placeholder="输入书名或ISBN号（回车确认）"
            on:keydown={(e) => e.key === "Enter" && dispatch("fetchBookData")}
        />
        <button on:click={() => dispatch("fetchBookData")}>🔍</button>
        <div class="loading-spinner">{statusMessage}</div>
        <button
            class="addBookButton"
            on:click={() => {
                dispatch("addBook");
            }}
        >
            ✅添加书籍
        </button>
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
                                    bind:value={bookInfo.translators}
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
                                    bind:value={bookInfo.publishDate}
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
                                    <option value={index}>{rating}</option>
                                {/each}
                            </select>
                        </label>
                    </div>
                    <div>
                        <label>
                            书籍分类：
                            <select bind:value={bookCategoryIndex}>
                                {#each customCategories as category, index}
                                    <option value={index}>{category}</option>
                                {/each}
                            </select>
                        </label>
                    </div>
                    <div>
                        <label>
                            阅读状态：
                            <select bind:value={readingStatusIndex}>
                                {#each customReadingStatuses as status, index}
                                    <option value={index}>{status}</option>
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
