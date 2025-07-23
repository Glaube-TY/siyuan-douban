<script lang="ts">
    import { onMount } from "svelte";
    import "../styles/main.scss";

    export let plugin: any;
    export let close: () => void;

    let remote: any = null;
    let loginWindow: any = null;
    let loading: boolean = true;
    let errorMessage: string = "";
    let cookies: string = ""; // 用于存储获取到的cookie

    onMount(async () => {
        try {
            remote = window.require("@electron/remote");
            extractQRCodeFromWindow();
        } catch (error) {
            console.error("Failed to load electron remote module:", error);
            errorMessage = "无法加载 Electron 模块";
            loading = false;
        }
    });

    async function extractQRCodeFromWindow() {
        if (!remote) {
            errorMessage = "Electron 模块不可用";
            loading = false;
            return;
        }
        // 创建一个可见的浏览器窗口来加载登录页面
        loginWindow = new remote.BrowserWindow({
            width: 400,
            height: 600,
            show: true, // 显示窗口
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
        });

        // 加载微信读书登录页面
        await loginWindow.loadURL("https://weread.qq.com/#login");

        // 监听窗口关闭事件
        loginWindow.on('close', async () => {
            try {
                // 获取页面cookie
                const session = remote.session.defaultSession;
                const cookieArray = await session.cookies.get({ url: 'https://weread.qq.com' });
                cookies = JSON.stringify(cookieArray, null, 2);
            } catch (error) {
                console.error("Failed to get cookies:", error);
                errorMessage = "获取Cookie失败: " + error.message;
            } finally {
                loading = false;
            }
        });
    }
</script>

<div class="weread-qrcode-dialog">
    {#if loading}
        <div>加载中...</div>
    {:else if errorMessage}
        <div class="error">{errorMessage}</div>
    {:else}
        <div>
            <h3>获取到的Cookie:</h3>
            <pre>{cookies}</pre>
        </div>
    {/if}
    <button on:click={close}>关闭</button>
</div>

<style lang="scss">
    .weread-qrcode-dialog {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        gap: 20px;
        padding: 20px;
        height: 300px;
        overflow-y: auto;
    }
    
    .error {
        color: red;
    }
    
    pre {
        background-color: #f5f5f5;
        padding: 10px;
        border-radius: 4px;
        max-width: 100%;
        overflow-y: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
    }
    
    button {
        padding: 8px 16px;
        background-color: #007cba;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
    
    button:hover {
        background-color: #005a87;
    }
</style>