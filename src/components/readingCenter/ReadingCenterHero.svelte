<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import SiYuanIcon from "../common/SiYuanIcon.svelte";

    const dispatch = createEventDispatcher();

    function handleSync() {
        dispatch("switchView", { view: "old-settings", tab: "weread" });
    }

    function handleNewNotes() {
        dispatch("scrollTo", { target: "recent-changes" });
    }

    function handleSettings() {
        dispatch("switchView", { view: "old-settings", tab: "settings" });
    }
</script>

<div class="reading-center-hero">
    <div class="hero-content">
        <div class="hero-text">
            <h1 class="hero-title">阅读总控制台</h1>
            <p class="hero-subtitle">管理阅读、同步、整理和回看的入口</p>
        </div>
        <div class="hero-actions">
            <button class="hero-btn hero-btn--primary" on:click={handleSync}>
                <SiYuanIcon name="sync" size={18} className="hero-btn-icon" />
                <span>同步微信读书</span>
            </button>
            <button class="hero-btn hero-btn--secondary" on:click={handleNewNotes}>
                <SiYuanIcon name="inbox" size={18} className="hero-btn-icon" />
                <span>查看新增笔记</span>
            </button>
            <button class="hero-btn hero-btn--ghost" on:click={handleSettings}>
                <SiYuanIcon name="settings" size={18} className="hero-btn-icon" />
                <span>进入设置</span>
            </button>
        </div>
    </div>
    <div class="hero-decoration">
        <div class="decoration-line"></div>
        <div class="decoration-dot"></div>
        <div class="decoration-line"></div>
    </div>
</div>

<style>
    .reading-center-hero {
        background: linear-gradient(135deg, var(--b3-theme-surface, #fff) 0%, var(--b3-theme-surface-light, #f8f9fa) 100%);
        border-radius: 12px;
        padding: 32px;
        margin-bottom: 24px;
        border: 1px solid var(--b3-border-color, #e0e0e0);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    }

    .hero-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 24px;
    }

    .hero-text {
        flex: 1;
    }

    .hero-title {
        font-size: 28px;
        font-weight: 700;
        color: var(--b3-theme-on-background, #1a1a1a);
        margin: 0 0 8px 0;
        letter-spacing: -0.5px;
    }

    .hero-subtitle {
        font-size: 15px;
        color: var(--b3-theme-on-surface-light, #666);
        margin: 0;
        line-height: 1.5;
    }

    .hero-actions {
        display: flex;
        gap: 12px;
        flex-shrink: 0;
    }

    .hero-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
        white-space: nowrap;
    }

    .hero-btn-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
    }

    .hero-btn--primary {
        background: var(--b3-theme-primary, #4CAF50);
        color: white;
    }

    .hero-btn--primary:hover {
        background: var(--b3-theme-primary-light, #66BB6A);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
    }

    .hero-btn--secondary {
        background: var(--b3-theme-surface, #fff);
        color: var(--b3-theme-primary, #4CAF50);
        border: 1px solid var(--b3-theme-primary, #4CAF50);
    }

    .hero-btn--secondary:hover {
        background: var(--b3-theme-primary-light, #E8F5E9);
        transform: translateY(-1px);
    }

    .hero-btn--ghost {
        background: transparent;
        color: var(--b3-theme-on-surface-light, #666);
        border: 1px solid var(--b3-border-color, #e0e0e0);
    }

    .hero-btn--ghost:hover {
        background: var(--b3-theme-surface-light, #f5f5f5);
        color: var(--b3-theme-on-surface, #1a1a1a);
    }

    .hero-decoration {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 24px;
        opacity: 0.3;
    }

    .decoration-line {
        flex: 1;
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--b3-border-color, #e0e0e0), transparent);
    }

    .decoration-dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--b3-theme-primary, #4CAF50);
    }

    @media (max-width: 920px) {
        .hero-content {
            flex-direction: column;
            align-items: flex-start;
        }

        .hero-actions {
            width: 100%;
            flex-wrap: wrap;
        }
    }

    @media (max-width: 768px) {
        .hero-btn {
            flex: 1;
            min-width: 120px;
            justify-content: center;
        }
    }
</style>
