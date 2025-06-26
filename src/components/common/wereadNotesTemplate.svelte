<script lang="ts">
    import "../styles/main.scss";

    export let newWereadTemplates: string;
    export let close: () => void;
    export let confirm: (newWereadTemplates: string) => void;
</script>

<div class="template-weread-dialog">
    <textarea class="weread-template" bind:value={newWereadTemplates}
    ></textarea>
    <div class="template-weread-btn">
        <button
            class="confirm-btn"
            on:click={() => confirm(newWereadTemplates)}
        >
            确认
        </button>
        <button class="cancel-btn" on:click={() => close()}> 取消 </button>
    </div>
</div>

<style lang="scss">
    .template-weread-dialog {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        gap: 10px;
        padding: 20px;

        .weread-template {
            width: 400px;
            height: 400px;
            border-radius: 8px;
            background-color: var(--b3-theme-background);
        }

        button {
            padding: 10px 20px;
            border-radius: 8px;
            border: 1px solid var(--b3-border-color);
        }

        .confirm-btn {
            &:hover {
                background-color: var(--b3-theme-primary);
                color: white;
            }
        }

        .cancel-btn {
            &:hover {
                background-color: var(--b3-theme-error);
                color: white;
            }
        }
    }
</style>
