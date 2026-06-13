<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";
    import type { WorkbenchAction } from "../../types/workbench";

    const dispatch = createEventDispatcher<{ action: WorkbenchAction }>();

    function action(type: WorkbenchAction) {
        dispatch("action", type);
    }
</script>

<section class="workbench-hero">
    <div class="workbench-hero-main">
        <div>
            <div class="workbench-hero-kicker">个人阅读中枢</div>
            <h1>阅读总控制台</h1>
            <p>管理阅读、同步、整理和回看的入口</p>
        </div>
        <div class="workbench-hero-actions">
            <button class="workbench-button" on:click={() => action("open-about")}>
                <SiYuanIcon name="info" size={16} />
                <span>关于</span>
            </button>
        </div>
    </div>
</section>

<style>
    .workbench-hero {
        border: 1px solid var(--b3-theme-border);
        border-radius: 8px;
        background:
            linear-gradient(135deg, color-mix(in srgb, var(--b3-theme-primary) 8%, transparent), transparent 42%),
            var(--b3-theme-surface);
        box-shadow: 0 10px 30px rgb(0 0 0 / 0.04);
    }

    .workbench-hero-main {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 18px;
        align-items: center;
        padding: clamp(18px, 2.2vw, 28px);
    }

    .workbench-hero-kicker {
        margin-bottom: 8px;
        color: var(--b3-theme-primary);
        font-size: 12px;
        font-weight: 700;
    }

    h1 {
        margin: 0;
        color: var(--b3-theme-on-background);
        font-size: clamp(24px, 3vw, 34px);
        line-height: 1.12;
        letter-spacing: 0;
    }

    p {
        margin: 8px 0 0;
        color: var(--b3-theme-on-surface-light);
        font-size: 14px;
        line-height: 1.5;
    }

    .workbench-hero-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
        max-width: 520px;
    }

    .workbench-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        height: 34px;
        padding: 0 12px;
        border: 1px solid var(--b3-theme-border);
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
            max-width: none;
        }
    }
</style>
