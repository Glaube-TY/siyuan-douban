<script lang="ts">
    import { createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher();

    export let plugin: any;
    export let noteTemplate: string;

    // 本地编辑副本，避免直接修改传入的 prop
    let localTemplate = noteTemplate;

    // 当外部 noteTemplate 变化时，更新本地副本
    $: localTemplate = noteTemplate;
</script>

<div class="template-editor-content">
    <!-- 主体编辑区 -->
    <div class="editor-area">
        <textarea
            bind:value={localTemplate}
            class="template-textarea"
            placeholder={plugin.i18n.placeholder2}
        ></textarea>
    </div>

    <!-- 底部按钮区 -->
    <div class="button-area">
        <button
            class="b3-button cancel-btn"
            on:click={() => dispatch("close")}
        >
            {plugin.i18n.cancel}
        </button>
        <button
            class="b3-button confirm-btn"
            on:click={() => dispatch("save", localTemplate)}
        >
            {plugin.i18n.confirm}
        </button>
    </div>
</div>

<style>
    .template-editor-content {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        padding: 16px;
        box-sizing: border-box;
    }

    .editor-area {
        flex: 1;
        overflow: hidden;
        margin-bottom: 16px;
    }

    .template-textarea {
        width: 100%;
        height: 100%;
        padding: 12px;
        font-family: monospace;
        font-size: 14px;
        line-height: 1.6;
        border: 1px solid var(--b3-theme-divider);
        border-radius: 4px;
        background-color: var(--b3-theme-background);
        color: var(--b3-theme-text);
        box-sizing: border-box;
        resize: none;
        outline: none;
        transition: border-color 0.2s ease, background-color 0.2s ease;
    }

    .button-area {
        display: flex;
        justify-content: center;
        gap: 12px;
        padding-top: 8px;
        border-top: 1px solid var(--b3-theme-divider);
    }

    .cancel-btn {
        padding: 8px 20px;
        border: 1px solid var(--b3-theme-divider);
        border-radius: 4px;
        background-color: var(--b3-theme-background);
        color: var(--b3-theme-text);
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .cancel-btn:hover {
        border-color: var(--b3-theme-text);
        background-color: var(--b3-theme-surface);
    }

    .confirm-btn {
        padding: 8px 20px;
        border: 1px solid var(--b3-theme-primary);
        border-radius: 4px;
        background-color: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .confirm-btn:hover {
        opacity: 0.9;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
</style>
