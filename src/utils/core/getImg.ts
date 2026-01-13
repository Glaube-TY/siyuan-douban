import { fetchSyncPost } from "siyuan";
import { formatTime } from './formatOp';

export async function getImage(url: string) {
    try {
        if (typeof window.require !== "function") {
            throw new Error("Electron environment required");
        }

        const remote = window.require('@electron/remote');
        if (!remote) {
            throw new Error("Remote module not available");
        }

        const { BrowserWindow } = remote;

        // 解析URL获取域名和路径信息
        const urlObj = new URL(url);
        const path = urlObj.pathname + urlObj.search;
        
        // 从图片URL中提取书籍ID信息，构建动态referer
        let bookId = '';
        const pathMatch = path.match(/s(\d+)\.jpg$/);
        if (pathMatch) {
            bookId = pathMatch[1];
        } else {
            const altMatch = path.match(/(\d+)\.jpg$/);
            if (altMatch) {
                bookId = altMatch[1];
            }
        }
        
        if (!bookId) {
            bookId = '37479747';
        }
        
        const refererUrl = `https://book.douban.com/subject/${bookId}/?icn=index-latestbook-subject`;
        
        return new Promise((resolve, reject) => {
            const imgWindow = new BrowserWindow({
                width: 1,
                height: 1,
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: false,
                    webSecurity: false
                }
            });

            imgWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
                details.requestHeaders['accept'] = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
                details.requestHeaders['accept-encoding'] = 'gzip, deflate, br, zstd';
                details.requestHeaders['accept-language'] = 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6';
                details.requestHeaders['cache-control'] = 'max-age=0';
                details.requestHeaders['referer'] = refererUrl;
                details.requestHeaders['sec-ch-ua'] = '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand)";v="24"';
                details.requestHeaders['sec-ch-ua-mobile'] = '?0';
                details.requestHeaders['sec-ch-ua-platform'] = '"Windows"';
                details.requestHeaders['sec-fetch-dest'] = 'image';
                details.requestHeaders['sec-fetch-mode'] = 'cors';
                details.requestHeaders['sec-fetch-site'] = 'cross-site';
                details.requestHeaders['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';
                callback({ requestHeaders: details.requestHeaders });
            });

            imgWindow.loadURL(url).then(() => {
                imgWindow.webContents.executeJavaScript(`
                    new Promise((resolve) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            resolve(canvas.toDataURL('image/jpeg'));
                        };
                        img.onerror = () => resolve('');
                        img.src = location.href;
                    });
                `).then((dataUrl) => {
                    imgWindow.destroy();
                    if (dataUrl) {
                        resolve(dataUrl);
                    } else {
                        reject(new Error('Failed to convert image'));
                    }
                }).catch((error) => {
                    imgWindow.destroy();
                    reject(error);
                });
            }).catch((error) => {
                imgWindow.destroy();
                reject(error);
            });
        });
    } catch (error) {
        console.error("图片获取失败:", error);
        return "";
    }
}

export async function downloadCover(base64Data: string, title: string,) {
    // 从base64数据中提取MIME类型
    const matches = base64Data.match(/^data:(image\/\w+);base64,/);
    if (!matches || matches.length < 2) {
        throw new Error('无效的Base64图片数据');
    }

    const mimeType = matches[1];
    const fileExt = mimeType.split('/')[1] || 'jpg';
    const cleanTitle = title.replace(/[^\w\u4e00-\u9fa5]/g, '_');
    const timestamp = formatTime();

    // 生成文件名（保持与原逻辑一致）
    const fileName = `${cleanTitle}_${timestamp}.${fileExt}`;
    const filePath = `/data/assets/covers/${fileName}`;

    // 创建文件对象
    const byteString = atob(base64Data.split(',')[1]);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
    }
    const imageFile = new File([uint8Array], fileName, { type: mimeType });

    // 使用思源 API 上传文件
    const formData = new FormData();
    formData.append("path", filePath);
    formData.append("file", imageFile);
    const response = await fetchSyncPost('/api/file/putFile', formData);

    if (response.code !== 0) {
        throw new Error(response.msg || "封面保存失败");
    }

    return `assets/covers/${fileName}`;
}