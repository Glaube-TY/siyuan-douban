<script lang="ts">
    import { onMount, tick } from "svelte";
    import { showMessage } from "siyuan";
    import type { ReadingTopic } from "../../types/readingTopic";
    import { createReadingTopic } from "../../utils/readingCenter/readingTopicService";
    import { t } from "../../utils/i18n";

    export let plugin: any;
    export let close: () => void;
    export let onCreated: ((topic: ReadingTopic) => void) | undefined = undefined;

    let name = "";
    let description = "";
    let nameInput: HTMLInputElement | null = null;
    let submitting = false;
    let errorMessage = "";

    const tx = (key: string, fallback: string, params: Record<string, string | number> = {}) =>
        t(plugin, key, fallback, params);

    onMount(() => {
        void tick().then(() => nameInput?.focus());
    });

    function getErrorMessage(error: any): string {
        const message = error?.message || String(error) || tx("uiUnknownError", "未知错误");
        return message === "已存在同名主题"
            ? tx("topicsDuplicateName", "已存在同名主题")
            : message;
    }

    async function submit(): Promise<void> {
        const nextName = name.trim();
        if (!nextName || submitting) return;

        submitting = true;
        errorMessage = "";
        try {
            const topic = await createReadingTopic(plugin, {
                name: nextName,
                description: description.trim(),
            });
            showMessage(tx("topicsCreated", "已创建主题「{topic}」", { topic: topic.name }));
            onCreated?.(topic);
            close();
        } catch (error: any) {
            errorMessage = getErrorMessage(error);
        } finally {
            submitting = false;
        }
    }
</script>

<div class="topic-create-dialog">
    <form class="topic-create-form" aria-busy={submitting} on:submit|preventDefault={submit}>
        <div class="form-field">
            <label for="topic-create-name">{tx("topicsNameLabel", "主题名称")}</label>
            <input
                id="topic-create-name"
                bind:this={nameInput}
                bind:value={name}
                type="text"
                placeholder={tx("topicsNamePlaceholder", "输入主题名称")}
                required
                aria-required="true"
                disabled={submitting}
            />
        </div>

        <div class="form-field">
            <label for="topic-create-description">{tx("topicsDescriptionLabel", "主题说明")}</label>
            <textarea
                id="topic-create-description"
                bind:value={description}
                rows="3"
                placeholder={tx("topicsDescriptionPlaceholder", "输入主题说明（可选）")}
                disabled={submitting}
            ></textarea>
        </div>

        {#if errorMessage}
            <div class="form-error" role="alert">
                {tx("topicsCreateFailed", "创建主题失败：{error}", { error: errorMessage })}
            </div>
        {/if}

        <div class="topic-create-footer">
            <button type="button" class="topic-create-cancel" on:click={close} disabled={submitting}>
                {tx("cancel", "取消")}
            </button>
            <button type="submit" class="topic-create-primary" disabled={!name.trim() || submitting}>
                {submitting ? tx("topicsCreating", "创建中...") : tx("topicsCreateDialogTitle", "创建主题")}
            </button>
        </div>
    </form>
</div>

<style>
    .topic-create-dialog {
        box-sizing: border-box;
        padding: 16px;
        color: var(--b3-theme-on-surface, #1f2937);
    }

    .topic-create-form {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
    }

    .form-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
    }

    .form-field label {
        color: var(--b3-theme-on-surface, #1f2937);
        font-size: 13px;
        font-weight: 600;
        line-height: 1.4;
    }

    .form-field input,
    .form-field textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 6px;
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-on-surface, #1f2937);
        font: inherit;
        font-size: 13px;
        line-height: 1.5;
    }

    .form-field input {
        min-height: 34px;
        padding: 7px 10px;
    }

    .form-field textarea {
        min-height: 68px;
        max-height: 120px;
        padding: 7px 10px;
        resize: vertical;
    }

    .form-field input::placeholder,
    .form-field textarea::placeholder {
        color: var(--b3-theme-on-surface-light, #777);
    }

    .form-field input:focus-visible,
    .form-field textarea:focus-visible,
    .topic-create-footer button:focus-visible {
        outline: 2px solid var(--b3-theme-primary, #4caf50);
        outline-offset: 1px;
    }

    .form-field input:disabled,
    .form-field textarea:disabled,
    .topic-create-footer button:disabled {
        cursor: default;
        opacity: 0.65;
    }

    .form-error {
        color: var(--b3-theme-error, #c0392b);
        font-size: 12px;
        line-height: 1.5;
    }

    .topic-create-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
        padding-top: 4px;
    }

    .topic-create-footer button {
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

    .topic-create-primary {
        border-color: var(--b3-theme-primary, #4caf50) !important;
        background: var(--b3-theme-primary, #4caf50) !important;
        color: var(--b3-theme-on-primary, #fff) !important;
    }

    .topic-create-primary:hover:not(:disabled) {
        filter: brightness(0.96);
    }

    .topic-create-primary:disabled {
        border-color: var(--b3-border-color, #e0e0e0) !important;
        background: var(--b3-theme-background, #f5f5f5) !important;
        color: var(--b3-theme-on-surface-light, #777) !important;
    }

    @media (max-width: 600px) {
        .topic-create-dialog {
            padding: 12px;
        }

        .topic-create-footer {
            justify-content: stretch;
        }

        .topic-create-footer button {
            flex: 1 1 0;
        }
    }
</style>
