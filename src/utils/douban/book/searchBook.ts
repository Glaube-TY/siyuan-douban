import { showMessage } from "siyuan";

interface SearchResult {
    success: boolean;
    html?: string;
    error?: string;
}

/**
 * 注入持久化顶部控制栏（幂等：每次注入前先移除旧的）
 */
function injectPersistentControlBar(searchWindow: any) {
    try {
        searchWindow.webContents.executeJavaScript(`
            (function() {
                const existingBar = document.getElementById('douban-persistent-control-bar');
                if (existingBar) {
                    existingBar.remove();
                }

                const controlBar = document.createElement('div');
                controlBar.id = 'douban-persistent-control-bar';
                controlBar.innerHTML = \`
                    <div style="position: fixed; top: 0; left: 0; right: 0; height: 56px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; z-index: 2147483647; box-shadow: 0 2px 10px rgba(0,0,0,0.2); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 16px; font-weight: 500;">📚 豆瓣图书搜索</span>
                            <span style="font-size: 12px; opacity: 0.85;">请进入书籍详情页后再点击获取</span>
                        </div>
                        <div>
                            <button id="get-book-info-persistent" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px; font-size: 14px; transition: background 0.3s;" onmouseover="this.style.background='#218838'" onmouseout="this.style.background='#28a745'">📖 获取此书信息</button>
                            <button id="close-window-persistent" style="background: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; transition: background 0.3s;" onmouseover="this.style.background='#c82333'" onmouseout="this.style.background='#dc3545'">❌ 关闭窗口</button>
                        </div>
                    </div>
                \`;

                document.documentElement.appendChild(controlBar);

                document.body.style.paddingTop = '56px';

                window._doubanGetBookInfo = function() {
                    const btn = document.getElementById('get-book-info-persistent');
                    if (btn) {
                        btn.innerHTML = '⏳ 获取中...';
                        btn.disabled = true;
                    }

                    const htmlContent = document.documentElement.outerHTML;

                    const processingTip = document.createElement('div');
                    processingTip.innerHTML = '<div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0, 123, 255, 0.9); color: white; padding: 20px; border-radius: 8px; z-index: 1000000; font-size: 16px; text-align: center;">📚 正在处理书籍信息...<br><small>请稍候</small></div>';
                    document.body.appendChild(processingTip);

                    console.log('[CAPTURE]' + htmlContent);

                    setTimeout(() => {
                        window.close();
                    }, 1000);
                };

                window._doubanCloseWindow = function() {
                    window.close();
                };

                const getBtn = document.getElementById('get-book-info-persistent');
                const closeBtn = document.getElementById('close-window-persistent');
                if (getBtn) getBtn.addEventListener('click', window._doubanGetBookInfo);
                if (closeBtn) closeBtn.addEventListener('click', window._doubanCloseWindow);
            })();
        `);
    } catch {
        // executeJavaScript 失败时静默处理，不抛出未处理异常
    }
}

/**
 * 启动控制栏看门狗：立即注入一次，之后每 500ms 注入一次，窗口销毁后自动停止
 */
function startControlBarWatchdog(searchWindow: any) {
    injectPersistentControlBar(searchWindow);

    const timer = setInterval(() => {
        try {
            if (searchWindow.isDestroyed()) {
                clearInterval(timer);
                return;
            }
            injectPersistentControlBar(searchWindow);
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

            // 启动看门狗，在多个导航事件上持续注入控制栏
            searchWindow.webContents.on('dom-ready', () => {
                injectPersistentControlBar(searchWindow);
            });
            searchWindow.webContents.on('did-start-navigation', () => {
                injectPersistentControlBar(searchWindow);
            });
            searchWindow.webContents.on('did-navigate', () => {
                injectPersistentControlBar(searchWindow);
            });
            searchWindow.webContents.on('did-navigate-in-page', () => {
                injectPersistentControlBar(searchWindow);
            });
            searchWindow.webContents.on('did-finish-load', () => {
                injectPersistentControlBar(searchWindow);
            });
            searchWindow.webContents.on('did-stop-loading', () => {
                injectPersistentControlBar(searchWindow);
            });

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
            startControlBarWatchdog(searchWindow);

            // 加载搜索页面
            await searchWindow.loadURL(searchUrl, {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
                httpReferrer: "https://www.douban.com/"
            });

            // loadURL 完成后立即补注入一次
            injectPersistentControlBar(searchWindow);

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
