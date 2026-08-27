<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import ReadingAnnotations from "../readingCenter/ReadingAnnotations.svelte";
    import ReadingReview from "../readingCenter/ReadingReview.svelte";
    import ReadingTopics from "../readingCenter/ReadingTopics.svelte";
    import type { WorkbenchAction } from "../../types/workbench";
    import { t } from "../../utils/i18n";
    import WorkbenchShelfHub from "./WorkbenchShelfHub.svelte";

    export let plugin: any;
    export let refreshKey = 0;
    export let mobile = false;

    type LibrarySection = "books" | "annotations" | "topics" | "review";

    const dispatch = createEventDispatcher<{ action: WorkbenchAction }>();
    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);
    const tabs: Array<{ key: LibrarySection; labelKey: string; fallback: string }> = [
        { key: "books", labelKey: "readingLibraryBooks", fallback: "书籍" },
        { key: "annotations", labelKey: "readingLibraryAnnotations", fallback: "批注" },
        { key: "topics", labelKey: "readingLibraryTopics", fallback: "主题" },
        { key: "review", labelKey: "readingLibraryReview", fallback: "复习" },
    ];

    let activeSection: LibrarySection = "books";
</script>

<div class="reading-library" class:reading-library-mobile={mobile}>
    <div class="reading-library-tabs" role="tablist" aria-label={tx("readingLibraryNavLabel", "阅读资料库导航")}>
        {#each tabs as tab (tab.key)}
            <button
                type="button"
                role="tab"
                class:active={activeSection === tab.key}
                aria-selected={activeSection === tab.key}
                on:click={() => (activeSection = tab.key)}
            >
                {tx(tab.labelKey, tab.fallback)}
            </button>
        {/each}
    </div>

    <div class="reading-library-content">
        {#if activeSection === "books"}
            <WorkbenchShelfHub {plugin} {refreshKey} embedded={true} />
        {:else if activeSection === "annotations"}
            <ReadingAnnotations
                {plugin}
                {refreshKey}
                {mobile}
                on:requestFullSync={() => dispatch("action", "sync-weread-all")}
                on:requestOpenTopics={() => (activeSection = "topics")}
            />
        {:else if activeSection === "topics"}
            <ReadingTopics
                {plugin}
                embedded={true}
            />
        {:else}
            <ReadingReview {plugin} embedded={true} />
        {/if}
    </div>
</div>

<style>
    .reading-library {
        display: grid;
        gap: clamp(14px, 1.7vw, 20px);
        min-width: 0;
    }

    .reading-library-tabs {
        display: flex;
        flex: 0 0 auto;
        flex-wrap: nowrap;
        gap: 2px;
        width: fit-content;
        max-width: 100%;
        padding: 3px;
        overflow-x: auto;
        overflow-y: hidden;
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: color-mix(in srgb, var(--b3-theme-surface) 82%, var(--b3-theme-background));
        box-sizing: border-box;
        scrollbar-width: thin;
    }

    .reading-library-tabs button {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        min-height: 32px;
        padding: 6px 12px;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: var(--b3-theme-on-surface);
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.25;
        white-space: nowrap;
        transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
    }

    .reading-library-tabs button:hover {
        background: var(--b3-theme-background);
    }

    .reading-library-tabs button.active {
        border-color: color-mix(in srgb, var(--b3-theme-primary) 32%, var(--b3-border-color));
        background: color-mix(in srgb, var(--b3-theme-primary) 10%, var(--b3-theme-surface));
        color: var(--b3-theme-primary);
    }

    .reading-library-tabs button:focus-visible {
        outline: 2px solid var(--b3-theme-primary);
        outline-offset: 1px;
    }

    .reading-library-content {
        min-width: 0;
    }

    @media (prefers-reduced-motion: reduce) {
        .reading-library-tabs button {
            transition: none;
        }
    }
</style>
