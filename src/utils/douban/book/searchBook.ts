import { showMessage } from "siyuan";

interface SearchResult {
    success: boolean;
    html?: string;
    error?: string;
}

/**
 * 确保悬浮操作区存在且可用（幂等：不删除重建，只更新/补充）
 */
function ensureFloatingActions(searchWindow: any) {
    try {
        searchWindow.webContents.executeJavaScript(`
            (function() {
                // 1. 清理旧顶部栏（如果存在）
                const oldBar = document.getElementById('douban-persistent-control-bar');
                if (oldBar) {
                    oldBar.remove();
                    if (document.body) {
                        document.body.style.paddingTop = '';
                    }
                }

                // 2. 确保悬浮容器存在
                let container = document.getElementById('douban-floating-actions');
                if (!container) {
                    container = document.createElement('div');
                    container.id = 'douban-floating-actions';
                    container.innerHTML = \`
                        <div style="position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; display: flex; flex-direction: column; gap: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            <button id="douban-confirm-book" style="background: var(--b3-theme-primary, #28a745); color: white; border: none; padding: 10px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: opacity 0.2s;">确认书籍</button>
                            <button id="douban-close-window" style="background: var(--b3-theme-surface, #dc3545); color: white; border: none; padding: 10px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: opacity 0.2s;">关闭窗口</button>
                        </div>
                    \`;
                    document.documentElement.appendChild(container);
                }

                // 3. 确保全局处理器存在
                window._doubanGetBookInfo = function() {
                    const btn = document.getElementById('douban-confirm-book');
                    if (btn) {
                        btn.innerHTML = '获取中...';
                        btn.disabled = true;
                    }

                    const htmlContent = document.documentElement.outerHTML;

                    const processingTip = document.createElement('div');
                    processingTip.innerHTML = '<div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0, 123, 255, 0.9); color: white; padding: 20px; border-radius: 8px; z-index: 1000000; font-size: 16px; text-align: center;">正在处理书籍信息...<br><small>请稍候</small></div>';
                    document.body.appendChild(processingTip);

                    console.log('[CAPTURE]' + htmlContent);

                    setTimeout(() => {
                        window.close();
                    }, 1000);
                };

                window._doubanCloseWindow = function() {
                    console.log('[DOUBAN_CLOSE]');
                    window.close();
                };

                // 4. 确保按钮状态与事件绑定正确（使用 onclick 覆盖，避免重复监听）
                const confirmBtn = document.getElementById('douban-confirm-book');
                const closeBtn = document.getElementById('douban-close-window');
                if (confirmBtn) {
                    confirmBtn.innerHTML = '确认书籍';
                    confirmBtn.disabled = false;
                    confirmBtn.onclick = window._doubanGetBookInfo;
                }
                if (closeBtn) {
                    closeBtn.innerHTML = '关闭窗口';
                    closeBtn.disabled = false;
                    closeBtn.onclick = window._doubanCloseWindow;
                }
            })();
        `);
    } catch {
        // executeJavaScript 失败时静默处理，不抛出未处理异常
    }
}

/**
 * 启动悬浮按钮看门狗：立即注入一次，之后每 500ms 检查并补充一次，窗口销毁后自动停止
 */
function startFloatingActionsWatchdog(searchWindow: any) {
    ensureFloatingActions(searchWindow);

    const timer = setInterval(() => {
        try {
            if (searchWindow.isDestroyed()) {
                clearInterval(timer);
                return;
            }
            ensureFloatingActions(searchWindow);
        } catch {
            clearInterval(timer);
        }
    }, 500);

    searchWindow.on('closed', () => {
        clearInterval(timer);
    });
}

export async function openInteractiveSearchWindow(
    searchKeyword: string,
    i18n: any
): Promise<SearchResult> {
    return new Promise(async (resolve, reject) => {
        let remote: any = null;
        let searchWindow: any = null;
        let isCompleted = false;

        try {
            // 检查 Electron 环境
            if (!window.navigator.userAgent.includes("Electron") || typeof window.require !== "function") {
                showMessage(i18n.showMessage39);
                return reject({ success: false, error: "Unsupported environment" });
            }

            remote = window.require("@electron/remote");
            if (!remote) {
                showMessage(i18n.showMessage24);
                return reject({ success: false, error: "Remote module not available" });
            }

            // 创建可交互的搜索窗口（无边框窗口）
            searchWindow = new remote.BrowserWindow({
                width: 1200,
                height: 800,
                show: false,
                frame: false,
                titleBarStyle: 'hidden',
                autoHideMenuBar: true,
                title: `豆瓣搜索: ${searchKeyword}`,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: false,
                    webSecurity: false,
                    allowRunningInsecureContent: true,
                    experimentalFeatures: true
                }
            });

            // 在多个导航事件上持续注入悬浮按钮
            const tryInject = () => {
                ensureFloatingActions(searchWindow);
                setTimeout(() => ensureFloatingActions(searchWindow), 300);
            };
            searchWindow.webContents.on('dom-ready', tryInject);
            searchWindow.webContents.on('did-start-navigation', tryInject);
            searchWindow.webContents.on('did-navigate', tryInject);
            searchWindow.webContents.on('did-navigate-in-page', tryInject);
            searchWindow.webContents.on('did-finish-load', tryInject);
            searchWindow.webContents.on('did-stop-loading', tryInject);

            const searchUrl = `https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(searchKeyword)}&cat=1001`;

            // 在加载URL之前设置额外的HTTP头部
            searchWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
                details.requestHeaders[':authority'] = 'search.douban.com';
                details.requestHeaders[':method'] = 'GET';
                details.requestHeaders[':path'] = searchUrl.replace('https://search.douban.com', '');
                details.requestHeaders[':scheme'] = 'https';
                details.requestHeaders['accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
                details.requestHeaders['accept-encoding'] = 'gzip, deflate, br, zstd';
                details.requestHeaders['accept-language'] = 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6';
                details.requestHeaders['cache-control'] = 'max-age=0';
                details.requestHeaders['priority'] = 'u=0, i';
                details.requestHeaders['sec-ch-ua'] = '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"';
                details.requestHeaders['sec-ch-ua-mobile'] = '?0';
                details.requestHeaders['sec-ch-ua-platform'] = '"Windows"';
                details.requestHeaders['sec-fetch-dest'] = 'document';
                details.requestHeaders['sec-fetch-mode'] = 'navigate';
                details.requestHeaders['sec-fetch-site'] = 'none';
                details.requestHeaders['sec-fetch-user'] = '?1';
                details.requestHeaders['upgrade-insecure-requests'] = '1';
                details.requestHeaders['referer'] = 'https://www.douban.com/';

                callback({ requestHeaders: details.requestHeaders });
            });

            // 在 loadURL 前启动看门狗
            startFloatingActionsWatchdog(searchWindow);

            // 加载搜索页面
            await searchWindow.loadURL(searchUrl, {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
                httpReferrer: "https://www.douban.com/"
            });

            // loadURL 完成后立即补注入一次
            ensureFloatingActions(searchWindow);

            // 显示窗口
            searchWindow.show();

            // 监听窗口关闭事件
            searchWindow.on('close', (_event) => {
                try {
                    const hasCapturedData = searchWindow.webContents.executeJavaScriptSync('window.__captureComplete');
                    if (hasCapturedData) {
                        return;
                    }
                } catch (checkError) {
                    // 无数据捕获，继续处理
                }

                if (!isCompleted) {
                    isCompleted = true;
                    resolve({ success: false, error: 'Window closed without selecting book' });
                }
            });

            // 监听页面内的数据获取请求
            searchWindow.webContents.on('console-message', (_event, _level, message) => {
                if (message.includes('[CAPTURE]') && !isCompleted) {
                    const htmlContent = message.replace('[CAPTURE]', '');
                    if (htmlContent && htmlContent.length > 0) {
                        isCompleted = true;
                        resolve({ success: true, html: htmlContent });

                        setTimeout(() => {
                            searchWindow.destroy();
                        }, 1000);
                    }
                } else if (message.includes('[DOUBAN_CLOSE]') && !isCompleted) {
                    isCompleted = true;
                    try {
                        searchWindow.destroy();
                    } catch {}
                    resolve({ success: false, error: 'Window closed by user' });
                }
            });

            // 监听窗口关闭完成事件进行清理
            searchWindow.on('closed', () => {
                if (!isCompleted) {
                    isCompleted = true;
                    resolve({ success: false, error: 'Window closed without capturing HTML' });
                }
            });

        } catch (error) {
            console.error('[BrowserWindow] Error in search window:', error);
            if (searchWindow) {
                try {
                    searchWindow.destroy();
                } catch (destroyError) {
                    console.error('[BrowserWindow] Error destroying window:', destroyError);
                }
            }
            reject({ success: false, error: error.message });
        }
    });
}
