<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import type { ReadingAnnotation } from "../../types/readingAnnotation";
    import type { ReadingTopic, ReadingTopicItem } from "../../types/readingTopic";
    import { addReadingAnnotationToTopic, loadReadingTopicsForPicker } from "../../utils/readingCenter/readingTopicService";
    import { t } from "../../utils/i18n";

    export let plugin: any;
    export let annotation: ReadingAnnotation;
    export let close: () => void;
    export let onRequestTopics: (() => void) | undefined = undefined;

    type LoadState = "loading" | "loaded" | "error";

    let loadState: LoadState = "loading";
    let errorMessage = "";
    let topics: ReadingTopic[] = [];
    let topicItems: ReadingTopicItem[] = [];
    let selectedTopicId = "";
    let submitting = false;

    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);

    onMount(() => {
        void loadTopics();
    });

    async function loadTopics(): Promise<void> {
        loadState = "loading";
        errorMessage = "";
        try {
            const result = await loadReadingTopicsForPicker(plugin);
            topics = result.topics;
            topicItems = result.topicItems;
            loadState = "loaded";
        } catch (error: any) {
            loadState = "error";
            errorMessage = error?.message || String(error) || "未知错误";
        }
    }

    function annotationTypeLabel(): string {
        return annotation.annotationType === "highlight"
            ? tx("readingAnnotationsHighlight", "划线")
            : tx("readingAnnotationsReview", "想法");
    }

    async function submit(): Promise<void> {
        if (!selectedTopicId || submitting) return;
        submitting = true;
        errorMessage = "";
        try {
            const result = await addReadingAnnotationToTopic(plugin, selectedTopicId, annotation);
            showMessage(result.alreadyExists
                ? tx("topicPickerAlreadyExists", "该批注已经在主题「{topic}」中", { topic: result.topic.name })
                : tx("topicPickerAdded", "已加入主题「{topic}」", { topic: result.topic.name }));
            close();
        } catch (error: any) {
            errorMessage = error?.message || String(error) || "未知错误";
            submitting = false;
        }
    }

    function requestTopics(): void {
        close();
        onRequestTopics?.();
    }
</script>

<div class="topic-picker">
    {#if loadState === "loading"}
        <div class="picker-state" role="status">{tx("topicPickerLoading", "正在加载主题...")}</div>
    {:else}
        <div class="annotation-preview">
            <div class="annotation-preview-label">
                {tx("topicPickerAnnotation", "待加入：{title} · {type}", { title: annotation.title, type: annotationTypeLabel() })}
            </div>
            <div class="annotation-preview-content">{annotation.content}</div>
        </div>

        {#if loadState === "error"}
            <div class="picker-state picker-state-error" role="alert">
                {tx("topicPickerLoadFailed", "主题数据读取失败：{error}", { error: errorMessage })}
            </div>
        {:else if topics.length === 0}
            <div class="picker-state" role="status">{tx("topicPickerNoTopics", "还没有主题，请先创建一个主题。")}</div>
        {:else}
            <div class="topic-picker-list" role="radiogroup" aria-label={tx("topicPickerTitle", "选择主题")}>
                {#each topics as topic (topic.id)}
                    <button
                        type="button"
                        class="topic-option"
                        class:selected={selectedTopicId === topic.id}
                        role="radio"
                        aria-checked={selectedTopicId === topic.id}
                        disabled={submitting}
                        on:click={() => (selectedTopicId = topic.id)}
                    >
                        <span class="topic-option-indicator" aria-hidden="true"></span>
                        <span class="topic-option-main">
                            <strong>{topic.name}</strong>
                            {#if topic.description}<span>{topic.description}</span>{/if}
                        </span>
                        <span class="topic-option-count">
                            {tx("topicsItemCount", "{count} 条", { count: topicItems.filter((item) => item.topicId === topic.id).length })}
                        </span>
                    </button>
                {/each}
            </div>
        {/if}

        {#if loadState === "loaded" && errorMessage}
            <div class="picker-state picker-state-error" role="alert">
                {tx("topicPickerSaveFailed", "加入主题失败：{error}", { error: errorMessage })}
            </div>
        {/if}
    {/if}

    <div class="picker-footer">
        <button type="button" class="picker-cancel" disabled={submitting} on:click={close}>
            {tx("cancel", "取消")}
        </button>
        {#if loadState === "loaded" && topics.length === 0}
            <button type="button" class="picker-primary" on:click={requestTopics}>
                {tx("topicPickerGoTopics", "前往主题")}
            </button>
        {:else}
            <button
                type="button"
                class="picker-primary"
                disabled={loadState !== "loaded" || !selectedTopicId || submitting}
                on:click={submit}
            >
                {submitting ? tx("topicPickerAdding", "加入中...") : tx("topicPickerConfirm", "加入主题")}
            </button>
        {/if}
    </div>
</div>

<style>
    .topic-picker {
        display: flex;
        flex-direction: column;
        gap: 12px;
        height: 100%;
        min-width: 0;
        min-height: 0;
        box-sizing: border-box;
        padding: 16px;
        color: var(--b3-theme-on-surface, #1f2937);
    }

    .annotation-preview,
    .topic-option,
    .picker-state {
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 8px;
        background: var(--b3-theme-surface, #fff);
    }

    .annotation-preview {
        min-width: 0;
        padding: 10px 12px;
        background: color-mix(in srgb, var(--b3-theme-primary, #4caf50) 6%, var(--b3-theme-surface, #fff));
    }

    .annotation-preview-label {
        overflow-wrap: anywhere;
        color: var(--b3-theme-primary, #4caf50);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.4;
    }

    .annotation-preview-content {
        display: -webkit-box;
        max-height: 4.5em;
        margin-top: 4px;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        overflow-wrap: anywhere;
        color: var(--b3-theme-on-surface, #1f2937);
        font-size: 13px;
        line-height: 1.5;
    }

    .topic-picker-list {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        gap: 8px;
        min-height: 0;
        overflow-y: auto;
        padding: 1px;
    }

    .topic-option {
        display: flex;
        align-items: center;
        width: 100%;
        min-height: 52px;
        gap: 10px;
        padding: 10px 12px;
        text-align: left;
        color: var(--b3-theme-on-surface, #1f2937);
        cursor: pointer;
        font: inherit;
    }

    .topic-option:hover {
        border-color: var(--b3-theme-primary, #4caf50);
    }

    .topic-option.selected {
        border-color: var(--b3-theme-primary, #4caf50);
        background: color-mix(in srgb, var(--b3-theme-primary, #4caf50) 9%, var(--b3-theme-surface, #fff));
    }

    .topic-option:focus-visible,
    .picker-footer button:focus-visible {
        outline: 2px solid var(--b3-theme-primary, #4caf50);
        outline-offset: 1px;
    }

    .topic-option:disabled,
    .picker-footer button:disabled {
        cursor: default;
        opacity: 0.65;
    }

    .topic-option-indicator {
        flex: 0 0 auto;
        width: 14px;
        height: 14px;
        border: 1px solid var(--b3-border-color, #c7c7c7);
        border-radius: 50%;
        background: var(--b3-theme-surface, #fff);
        box-sizing: border-box;
    }

    .topic-option.selected .topic-option-indicator {
        border-color: var(--b3-theme-primary, #4caf50);
        background: var(--b3-theme-primary, #4caf50);
        box-shadow: inset 0 0 0 3px var(--b3-theme-surface, #fff);
    }

    .topic-option-main {
        display: flex;
        flex: 1 1 auto;
        min-width: 0;
        flex-direction: column;
        gap: 3px;
    }

    .topic-option-main strong,
    .topic-option-main span {
        overflow-wrap: anywhere;
    }

    .topic-option-main strong {
        font-size: 13px;
        line-height: 1.4;
    }

    .topic-option-main span {
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 12px;
        line-height: 1.4;
    }

    .topic-option-count {
        flex: 0 0 auto;
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 12px;
        white-space: nowrap;
    }

    .picker-state {
        padding: 24px 16px;
        text-align: center;
        color: var(--b3-theme-on-surface-light, #666);
        font-size: 13px;
        line-height: 1.5;
    }

    .picker-state-error {
        color: var(--b3-theme-error, #c0392b);
    }

    .picker-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
        padding-top: 4px;
    }

    .picker-footer button {
        min-height: 32px;
        padding: 6px 12px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 6px;
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1f2937);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
    }

    .picker-primary {
        border-color: var(--b3-theme-primary, #4caf50) !important;
        background: var(--b3-theme-primary, #4caf50) !important;
        color: var(--b3-theme-on-primary, #fff) !important;
    }

    .picker-primary:disabled {
        border-color: var(--b3-border-color, #e0e0e0) !important;
        background: var(--b3-theme-background, #f5f5f5) !important;
        color: var(--b3-theme-on-surface-light, #777) !important;
    }

    @media (max-width: 600px) {
        .topic-picker {
            padding: 12px;
        }

        .picker-footer {
            justify-content: stretch;
        }

        .picker-footer button {
            flex: 1 1 0;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .topic-option,
        .picker-footer button {
            transition: none;
        }
    }
</style>
