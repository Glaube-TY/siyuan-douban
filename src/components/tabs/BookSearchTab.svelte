<script lang="ts">
    import type { I18N } from "siyuan";
    import { createEventDispatcher } from "svelte";
    import { getImage } from "@/utils/core/getImg";

    export let i18n: I18N;

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

    let coverData = "";

    $: if (bookInfo?.cover) {
        (async () => {
            try {
                coverData = await getImage(bookInfo.cover);
            } catch (error) {
                console.error("Cover loading failed:", error);
                coverData = "";
            }
        })();
    }
</script>

<div class="b3-dialog__content book-info">
    <div class="input-group">
        <input
            type="text"
            bind:value={inputVales}
            placeholder={i18n.placeholder1}
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
            {i18n.addBookButton}
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
                            src={coverData}
                            alt={i18n.bookCover}
                            class="book-cover"
                            style={!coverData ? "display: none;" : ""}
                        />
                    {/if}
                </div>
                <div class="info-column">
                    <div class="form-row">
                        <label
                            >{i18n.bookTitle}<input
                                bind:value={bookInfo.title}
                                style="width: 30em;"
                            /></label
                        >
                    </div>
                    <div class="form-row">
                        <label
                            >{i18n.bookSubtitle}
                            <input
                                bind:value={bookInfo.subtitle}
                                style="width: 29em;"
                            />
                        </label>
                    </div>
                    <div class="form-row">
                        <label
                            >{i18n.bookOriginalTitle}
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
                                >{i18n.bookAuthors}<input
                                    bind:value={bookInfo.authors}
                                    style="flex: 1;"
                                /></label
                            >
                        </div>
                        <div>
                            <label
                                >{i18n.bookTranslators}<input
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
                                >{i18n.bookPublishers}<input
                                    bind:value={bookInfo.publisher}
                                    style="flex: 1;"
                                /></label
                            >
                        </div>
                        <div>
                            <label
                                >{i18n.bookPublishDate}<input
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
                            >{i18n.bookProducers}<input
                                bind:value={bookInfo.producer}
                                style="width: 18em; min-width: 0;"
                            /></label
                        >
                    </div>
                    <div>
                        <label
                            >{i18n.bookSeries}<input
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
                            >{i18n.bookRating}<input
                                bind:value={bookInfo.rating}
                                style="width: 3em; min-width: 0;"
                            /></label
                        >
                    </div>
                    <div>
                        <label
                            >{i18n.bookRatingCount}<input
                                bind:value={bookInfo.ratingCount}
                                style="width: 3em; min-width: 0;"
                            /></label
                        >
                    </div>
                    <div>
                        <label
                            >{i18n.bookPrice}<input
                                bind:value={bookInfo.price}
                                style="width: 3em; min-width: 0;"
                            /></label
                        >
                    </div>
                    <div class="form-row">
                        <label
                            >{i18n.bookBinding}<input
                                bind:value={bookInfo.binding}
                                style="width: 3em; min-width: 0;"
                            /></label
                        >
                    </div>
                    <div>
                        <label
                            >{i18n.bookPages}<input
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
                            {i18n.bookMyRating}
                            <select bind:value={myRatingIndex}>
                                {#each customRatings as rating, index}
                                    <option value={index}>{rating}</option>
                                {/each}
                            </select>
                        </label>
                    </div>
                    <div>
                        <label>
                            {i18n.bookCategory}
                            <select bind:value={bookCategoryIndex}>
                                {#each customCategories as category, index}
                                    <option value={index}>{category}</option>
                                {/each}
                            </select>
                        </label>
                    </div>
                    <div>
                        <label>
                            {i18n.bookReadingStatus}
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
                            />{i18n.bookAddNotes}
                        </label>
                    </div>
                </div>

                <div
                    class="form-row"
                    style="display: flex; gap: 1em; justify-content: space-between;"
                >
                    <div>
                        <label>
                            {i18n.bookStartDate}
                            <input
                                type="date"
                                bind:value={bookInfo.startDate}
                            />
                        </label>
                    </div>
                    <div>
                        <label>
                            {i18n.bookFinishDate}
                            <input
                                type="date"
                                bind:value={bookInfo.finishDate}
                            />
                        </label>
                    </div>
                </div>
            </div>

            <!-- 下部区域 -->
            <div class="book-bottom-area">
                <div class="form-row">
                    <label>
                        {i18n.bookDescription}
                        <textarea
                            bind:value={bookInfo.description}
                            rows="4"
                        ></textarea>
                    </label>
                </div>
                <div class="form-row">
                    <label>
                        {i18n.bookAuthorBio}
                        <textarea
                            bind:value={bookInfo.authorBio}
                            rows="4"
                        ></textarea>
                    </label>
                </div>
            </div>
        </div>
    {/if}
</div>
