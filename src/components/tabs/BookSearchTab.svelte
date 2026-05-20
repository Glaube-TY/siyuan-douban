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
    export let databaseStatus: string;

    const dispatch = createEventDispatcher<{
        fetchBookData: void;
        addBook: void;
        openLocalBookShelf: void;
    }>();

    let coverData = "";

    $: if (bookInfo?.cover) {
        (async () => {
            try {
                coverData = String(await getImage(bookInfo.cover));
            } catch (error) {
                console.error("Cover loading failed:", error);
                coverData = "";
            }
        })();
    }
</script>

<div class="book-search-workspace">
    {#if databaseStatus === "error"}
        <div class="error-message">{i18n.databaseStatusMessage3}</div>
    {:else if databaseStatus === "success"}
        <div class="book-search-inner">
            <div class="search-header">
                <div class="search-bar">
                    <input
                        type="text"
                        class="b3-text-field"
                        bind:value={inputVales}
                        placeholder={i18n.searchPlaceholder}
                        on:keydown={(e) =>
                            e.key === "Enter" && dispatch("fetchBookData")}
                    />
                    <button class="b3-button b3-button--outline" on:click={() => dispatch("fetchBookData")}>{i18n.searchButton}</button>
                    <button
                        class="b3-button b3-button--primary"
                        on:click={() => dispatch("addBook")}
                        disabled={!bookInfo}
                    >
                        {i18n.addBookButton}
                    </button>
                    <button
                        class="b3-button b3-button--outline"
                        on:click={() => dispatch("openLocalBookShelf")}
                    >
                        {i18n.localBookShelfButton || "本地书架"}
                    </button>
                </div>

                {#if statusMessage}
                    <div class="search-status-row">
                        <span class="status-indicator">{statusMessage}</span>
                    </div>
                {/if}
            </div>

            {#if bookInfo}
                <div class="book-form">
                    <div class="book-meta-card">
                        <div class="book-meta-top">
                            <div class="book-cover-panel">
                                {#if bookInfo.cover}
                                    <img
                                        src={coverData}
                                        alt={i18n.bookCover}
                                        class="book-cover"
                                        style={!coverData ? "display: none;" : ""}
                                    />
                                {/if}
                                <label class="book-cover-note-toggle">
                                    <span class="settings-switch-label-text">{i18n.bookAddNotes}</span>
                                    <input
                                        type="checkbox"
                                        class="settings-switch"
                                        bind:checked={bookInfo.addNotes}
                                    />
                                    <span class="settings-switch-track">
                                        <span class="settings-switch-thumb"></span>
                                    </span>
                                </label>
                            </div>
                            <div class="book-title-panel">
                                <div class="field field-full">
                                    <label>
                                        <span>{i18n.bookTitle}</span>
                                        <input class="b3-text-field" bind:value={bookInfo.title} />
                                    </label>
                                </div>
                                <div class="field field-full">
                                    <label>
                                        <span>{i18n.bookSubtitle}</span>
                                        <input class="b3-text-field" bind:value={bookInfo.subtitle} />
                                    </label>
                                </div>
                                <div class="field field-full">
                                    <label>
                                        <span>{i18n.bookOriginalTitle}</span>
                                        <input class="b3-text-field" bind:value={bookInfo.originalTitle} />
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div class="book-meta-bottom">
                            <div class="field field-half">
                                <label>
                                    <span>{i18n.bookAuthors}</span>
                                    <input class="b3-text-field" bind:value={bookInfo.authors} />
                                </label>
                            </div>
                            <div class="field field-half">
                                <label>
                                    <span>{i18n.bookTranslators}</span>
                                    <input class="b3-text-field" bind:value={bookInfo.translators} />
                                </label>
                            </div>
                            <div class="field field-third">
                                <label>
                                    <span>{i18n.bookPublishers}</span>
                                    <input class="b3-text-field" bind:value={bookInfo.publisher} />
                                </label>
                            </div>
                            <div class="field field-third">
                                <label>
                                    <span>{i18n.bookPublishDate}</span>
                                    <input class="b3-text-field" bind:value={bookInfo.publishDate} />
                                </label>
                            </div>
                            <div class="field field-third">
                                <label>
                                    <span>{i18n.bookProducers}</span>
                                    <input class="b3-text-field" bind:value={bookInfo.producer} />
                                </label>
                            </div>
                            <div class="field field-half">
                                <label>
                                    <span>{i18n.bookSeries}</span>
                                    <input class="b3-text-field" bind:value={bookInfo.series} />
                                </label>
                            </div>
                            <div class="field field-quarter">
                                <label>
                                    <span>{i18n.bookRating}</span>
                                    <input class="b3-text-field" bind:value={bookInfo.rating} />
                                </label>
                            </div>
                            <div class="field field-quarter">
                                <label>
                                    <span>{i18n.bookRatingCount}</span>
                                    <input class="b3-text-field" bind:value={bookInfo.ratingCount} />
                                </label>
                            </div>
                            <div class="field field-quarter">
                                <label>
                                    <span>{i18n.bookPrice}</span>
                                    <input class="b3-text-field" bind:value={bookInfo.price} />
                                </label>
                            </div>
                            <div class="field field-quarter">
                                <label>
                                    <span>{i18n.bookBinding}</span>
                                    <input class="b3-text-field" bind:value={bookInfo.binding} />
                                </label>
                            </div>
                            <div class="field field-quarter">
                                <label>
                                    <span>{i18n.bookPages}</span>
                                    <input class="b3-text-field" bind:value={bookInfo.pages} />
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="book-section">
                        <div class="book-section-title">{i18n.personalRecord}</div>
                        <div class="book-info-grid">
                            <div class="field field-third">
                                <label>
                                    <span>{i18n.bookMyRating}</span>
                                    <select class="b3-select" bind:value={myRatingIndex}>
                                        {#each customRatings as rating, index}
                                            <option value={index}>{rating}</option>
                                        {/each}
                                    </select>
                                </label>
                            </div>
                            <div class="field field-third">
                                <label>
                                    <span>{i18n.bookCategory}</span>
                                    <select class="b3-select" bind:value={bookCategoryIndex}>
                                        {#each customCategories as category, index}
                                            <option value={index}>{category}</option>
                                        {/each}
                                    </select>
                                </label>
                            </div>
                            <div class="field field-third">
                                <label>
                                    <span>{i18n.bookReadingStatus}</span>
                                    <select class="b3-select" bind:value={readingStatusIndex}>
                                        {#each customReadingStatuses as status, index}
                                            <option value={index}>{status}</option>
                                        {/each}
                                    </select>
                                </label>
                            </div>
                            <div class="field field-half">
                                <label>
                                    <span>{i18n.bookStartDate}</span>
                                    <input
                                        type="date"
                                        class="b3-text-field"
                                        bind:value={bookInfo.startDate}
                                    />
                                </label>
                            </div>
                            <div class="field field-half">
                                <label>
                                    <span>{i18n.bookFinishDate}</span>
                                    <input
                                        type="date"
                                        class="b3-text-field"
                                        bind:value={bookInfo.finishDate}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="book-section">
                        <div class="book-section-title">{i18n.bookIntro}</div>
                        <textarea
                            class="b3-text-field book-textarea"
                            bind:value={bookInfo.description}
                            rows="4"
                        ></textarea>
                    </div>

                    <div class="book-section">
                        <div class="book-section-title">{i18n.authorIntro}</div>
                        <textarea
                            class="b3-text-field book-textarea"
                            bind:value={bookInfo.authorBio}
                            rows="4"
                        ></textarea>
                    </div>
                </div>
            {:else}
                <div class="empty-state">
                    <div class="empty-state-icon">📚</div>
                    <div class="empty-state-title">{i18n.noBookInfo}</div>
                    <div class="empty-state-desc">{i18n.noBookInfoDesc}</div>
                </div>
            {/if}
        </div>
    {/if}
</div>
