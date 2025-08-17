<script lang="ts">
    import "../styles/main.scss";

    export let plugin: any;
    export let cookies: string;
    export let close: () => void;
    export let confirm: (cookies: string) => void;
</script>

<div class="cookie-weread-dialog">
    <textarea class="weread-cookie" bind:value={cookies}></textarea>
    <div class="cookie-weread-btn">
        <button class="confirm-btn" on:click={() => confirm(cookies)}>
            {plugin.i18n.confirm}
        </button>
        <button class="cancel-btn" on:click={() => close()}> {plugin.i18n.cancel} </button>
    </div>
</div>

<style lang="scss">
    .cookie-weread-dialog {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        gap: 20px;
        padding: 20px;

        .weread-cookie {
            width: 400px;
            height: 200px;
            border-radius: 8px;
            background-color: var(--b3-theme-background);
            // 应用适配的主题色
            color: var(--text-color);
        }

        button {
            padding: 10px 20px;
            border-radius: 8px;
            border: 1px solid var(--b3-border-color);
            // 应用适配的主题色
            color: var(--b3-theme-primary);
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