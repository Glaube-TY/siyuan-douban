<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { WorkbenchAction } from "../../types/workbench";
    import { t } from "../../utils/i18n";

    export let plugin: any;

    const dispatch = createEventDispatcher<{ action: WorkbenchAction }>();

    function action(type: WorkbenchAction) {
        dispatch("action", type);
    }
</script>

<section class="workbench-hero">
    <div class="workbench-hero-main">
        <div>
            <h1>{t(plugin, "workbenchHeroTitle", "阅读总控制台")}</h1>
        </div>
        <div class="workbench-hero-actions">
            <button class="workbench-button" on:click={() => action("open-about")}>
                <SiYuanIcon name="info" size={16} />
                <span>{t(plugin, "workbenchNavAbout", "关于")}</span>
            </button>
        </div>
    </div>
</section>

<style>
    .workbench-hero {
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-surface);
        box-shadow: none;
    }

    .workbench-hero-main {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 18px;
        align-items: center;
        padding: 8px 12px;
    }

    h1 {
        margin: 0;
        color: var(--b3-theme-on-background);
        font-size: clamp(18px, 1.7vw, 21px);
        line-height: 1.25;
        letter-spacing: 0;
    }

    .workbench-hero-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    .workbench-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        height: 32px;
        padding: 0 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: 7px;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
    }

    .workbench-button:hover {
        transform: translateY(-1px);
        border-color: var(--b3-theme-primary);
    }

    @media (max-width: 860px) {
        .workbench-hero-main {
            grid-template-columns: 1fr;
        }

        .workbench-hero-actions {
            justify-content: flex-start;
        }
    }
</style>
