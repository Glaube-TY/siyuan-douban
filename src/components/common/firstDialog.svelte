<script lang="ts">
    export let plugin: any;
    export let onContinue: () => void;
    export let onNeverNotice: () => void;
    export let onClose: () => void;
</script>

<div class="first-dialog-container">
    <div class="first-dialog-title">
        <span class="title-icon">📚</span>
        {plugin.i18n.firstDialog1}
        <span class="title-decoration"></span>
    </div>
    <div class="first-dialog-tip">
        <div class="tip-section">
            <div class="tip-title">📋 {plugin.i18n.firstDialog2}</div>
            <div class="tip-content">
                {plugin.i18n.firstDialog3}
                <div class="tip-links">
                    <a
                        href="https://ttl8ygt82u.feishu.cn/wiki/VZdjwDNxWi4j0jkdyxMcOg2VnFf?from=from_copylink"
                        target="_blank"
                        class="tip-link"
                    >
                        📖 {plugin.i18n.firstDialog4}
                    </a>
                    <a
                        href="https://www.bilibili.com/video/BV1KypvzSEWx?share_source=copy_web"
                        target="_blank"
                        class="tip-link"
                    >
                        🎥 {plugin.i18n.firstDialog5}
                    </a>
                </div>
            </div>
        </div>
        
        <div class="tip-section">
            <div class="tip-title">⚠️ {plugin.i18n.firstDialog6}</div>
            <div class="tip-content" style="color: red;">
                {plugin.i18n.firstDialog7}
            </div>
        </div>
        
        <div class="tip-section">
            <div class="tip-title">💬 {plugin.i18n.firstDialog8}</div>
            <div class="tip-content">
                {plugin.i18n.firstDialog9}
                <div class="tip-links">
                    <a
                        href="https://github.com/ttl8ygt82u/siyuan-douban/issues"
                        target="_blank"
                        class="tip-link"
                    >
                        <svg class="github-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                        GitHub Issues
                    </a>
                    <a href="https://pd.qq.com/s/2ks4079x0" target="_blank" class="tip-link">
                        👥 {plugin.i18n.firstDialog10}
                    </a>
                </div>
            </div>
        </div>
    </div>
    <div class="first-dialog-btn">
        <button on:click={() => onContinue()}> {plugin.i18n.firstDialog11} </button>
        <button on:click={() => onNeverNotice()}> {plugin.i18n.firstDialog12} </button>
        <button on:click={() => onClose()}> {plugin.i18n.firstDialog13} </button>
    </div>
</div>

<style lang="scss">
    .first-dialog-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 2rem;
        background: linear-gradient(135deg, var(--b3-theme-background) 0%, var(--b3-theme-background-light) 100%);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        max-width: 500px;
        margin: 0 auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .first-dialog-title {
        font-size: 1.75rem;
        font-weight: 700;
        color: var(--b3-theme-primary);
        margin-bottom: 1.5rem;
        text-align: center;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        
        .title-icon {
            font-size: 2rem;
            animation: bounce 2s infinite;
        }
        
        .title-decoration {
            position: absolute;
            bottom: -8px;
            left: 50%;
            transform: translateX(-50%);
            width: 60px;
            height: 3px;
            background: linear-gradient(90deg, var(--b3-theme-primary), var(--b3-theme-secondary));
            border-radius: 2px;
        }
    }
    
    @keyframes bounce {
        0%, 20%, 50%, 80%, 100% {
            transform: translateY(0);
        }
        40% {
            transform: translateY(-10px);
        }
        60% {
            transform: translateY(-5px);
        }
    }

    .first-dialog-tip {
        background: var(--b3-theme-background-light);
        padding: 1.5rem;
        border-radius: 8px;
        border-left: 4px solid var(--b3-theme-primary);
        margin-bottom: 2rem;
        line-height: 1.6;
        color: var(--b3-theme-on-background);
        font-size: 0.95rem;
        text-align: left;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }

    .tip-section {
        margin-bottom: 1.5rem;
        
        &:last-child {
            margin-bottom: 0;
        }
    }

    .tip-title {
        font-weight: 600;
        color: var(--b3-theme-primary);
        margin-bottom: 0.5rem;
        font-size: 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .tip-content {
        color: var(--b3-theme-on-background);
        line-height: 1.7;
    }

    .tip-links {
        display: flex;
        gap: 1rem;
        margin-top: 0.5rem;
        flex-wrap: wrap;
    }

    .tip-link {
        color: var(--b3-theme-primary);
        text-decoration: none;
        font-weight: 500;
        transition: all 0.3s ease;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        background: rgba(var(--b3-theme-primary-rgb), 0.05);
        
        &:hover {
            color: var(--b3-theme-secondary);
            background: rgba(var(--b3-theme-primary-rgb), 0.1);
            text-decoration: underline;
            transform: translateY(-1px);
        }
        
        &::after {
            content: " ↗";
            font-size: 0.8em;
            opacity: 0.7;
        }
    }

    .github-icon {
        vertical-align: middle;
        margin-right: 0.5rem;
        transition: transform 0.3s ease;
    }

    .tip-link:hover .github-icon {
        transform: scale(1.1);
    }

    .first-dialog-btn {
        display: flex;
        gap: 1rem;
        justify-content: center;
        flex-wrap: wrap;
        width: 100%;

        button {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            min-width: 100px;
            position: relative;
            overflow: hidden;
            
            &:first-child {
                background: linear-gradient(45deg, var(--b3-theme-primary), var(--b3-theme-secondary));
                color: white;
                box-shadow: 0 4px 15px rgba(var(--b3-theme-primary-rgb), 0.3);
                
                &:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(var(--b3-theme-primary-rgb), 0.4);
                }
            }
            
            &:nth-child(2) {
                background: var(--b3-theme-surface);
                color: var(--b3-theme-on-surface);
                border: 1px solid var(--b3-theme-on-surface-light);
                
                &:hover {
                    background: var(--b3-theme-surface-light);
                    transform: translateY(-1px);
                }
            }
            
            &:last-child {
                background: var(--b3-theme-background);
                color: var(--b3-theme-on-background);
                border: 1px solid var(--b3-theme-border);
                
                &:hover {
                    background: var(--b3-theme-background-light);
                    border-color: var(--b3-theme-primary);
                }
            }
            
            &:active {
                transform: translateY(0);
            }
            
            &::before {
                content: "";
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
                transition: left 0.5s;
            }
            
            &:hover::before {
                left: 100%;
            }
        }
    }

    /* 响应式设计 */
    @media (max-width: 480px) {
        .first-dialog-container {
            padding: 1.5rem;
            margin: 1rem;
        }
        
        .first-dialog-title {
            font-size: 1.5rem;
        }
        
        .first-dialog-btn {
            flex-direction: column;
            align-items: center;
            
            button {
                width: 100%;
                max-width: 200px;
            }
        }
    }
</style>
