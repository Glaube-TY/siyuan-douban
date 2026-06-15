<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";

    const dispatch = createEventDispatcher();

    interface WorkflowStep {
        id: string;
        label: string;
        description: string;
        icon: string;
        action: () => void;
    }

    const steps: WorkflowStep[] = [
        {
            id: "sync",
            label: "微信读书同步",
            description: "同步划线、想法和书评",
            icon: "iconRefresh",
            action: () => dispatch("switchView", { view: "old-settings", tab: "weread" }),
        },
        {
            id: "inbox",
            label: "处理新增笔记",
            description: "查看新增划线和想法",
            icon: "iconInbox",
            action: () => dispatch("switchView", { view: "inbox" }),
        },
        {
            id: "status",
            label: "标记整理状态",
            description: "维护待整理、整理中和已整理",
            icon: "iconBookmark",
            action: () => dispatch("switchView", { view: "book-status" }),
        },
        {
            id: "review",
            label: "复习和主题",
            description: "回看摘录并沉淀主题",
            icon: "iconRiffCard",
            action: () => dispatch("switchView", { view: "review" }),
        },
    ];
</script>

<div class="workflow-guide">
    <h3 class="workflow-title">阅读工作流</h3>
    <div class="workflow-steps">
        {#each steps as step, index (step.id)}
            <button class="workflow-step" on:click={step.action}>
                <div class="step-number">{index + 1}</div>
                <div class="step-icon">
                    <SiYuanIcon name={step.icon} size={20} className="step-svg" />
                </div>
                <div class="step-content">
                    <div class="step-label">{step.label}</div>
                    <div class="step-description">{step.description}</div>
                </div>
                {#if index < steps.length - 1}
                    <div class="step-arrow">
                        <SiYuanIcon name="open" size={20} />
                    </div>
                {/if}
            </button>
        {/each}
    </div>
</div>

<style>
    .workflow-guide {
        background: var(--b3-theme-surface, #fff);
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 24px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    .workflow-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--b3-theme-on-surface, #1a1a1a);
        margin: 0 0 20px 0;
    }

    .workflow-steps {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
    }

    .workflow-step {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        background: var(--b3-theme-background, #f5f5f5);
        border: 1px solid var(--b3-border-color, #e0e0e0);
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
    }

    .workflow-step:hover {
        background: var(--b3-theme-surface-light, #f8f9fa);
        border-color: var(--b3-theme-primary, #4CAF50);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    .step-number {
        position: absolute;
        top: -8px;
        left: -8px;
        width: 24px;
        height: 24px;
        background: var(--b3-theme-primary, #4CAF50);
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 600;
    }

    .step-icon {
        width: 40px;
        height: 40px;
        background: var(--b3-theme-surface, #fff);
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
    }

    .step-svg {
        width: 20px;
        height: 20px;
        color: var(--b3-theme-primary, #4CAF50);
    }

    .step-content {
        flex: 1;
        text-align: left;
    }

    .step-label {
        font-size: 14px;
        font-weight: 600;
        color: var(--b3-theme-on-surface, #1a1a1a);
        margin-bottom: 4px;
    }

    .step-description {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light, #666);
        line-height: 1.4;
    }

    .step-arrow {
        position: absolute;
        right: -18px;
        top: 50%;
        transform: translateY(-50%);
        width: 24px;
        height: 24px;
        color: var(--b3-border-color, #e0e0e0);
        z-index: 1;
    }

    .step-arrow svg {
        width: 100%;
        height: 100%;
    }

    @media (max-width: 1100px) {
        .workflow-steps {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .step-arrow {
            display: none;
        }
    }

    @media (max-width: 768px) {
        .workflow-steps {
            grid-template-columns: 1fr;
        }

        .workflow-step {
            min-width: auto;
        }

        .step-arrow {
            display: none;
        }
    }
</style>
