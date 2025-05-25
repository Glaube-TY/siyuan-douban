<script lang="ts">
    import { createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher();

    export let showTemplateEditor: boolean;
    export let noteTemplate: string;
</script>

{#if showTemplateEditor}
    <div class="b3-dialog-container" style="z-index: 9999;">
        <div
            class="b3-dialog-scrim"
            role="button"
            tabindex="0"
            on:click|self={() => dispatch("close")}
            on:keydown={(e) =>
                (e.key === "Enter" || e.key === " ") && dispatch("close")}
        ></div>

        <div class="b3-dialog-card">
            <div class="b3-dialog__header">
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
                            on:click={() => dispatch("close")}>取消</button
                        >
                        <button
                            class="b3-button dialog-btn primary-btn"
                            on:click={() => dispatch("save")}
                        >
                            保存模板
                        </button>
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
