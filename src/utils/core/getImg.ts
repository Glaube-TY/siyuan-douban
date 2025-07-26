import { fetchSyncPost } from "siyuan";
import { formatTime } from './formatOp';

export async function getImage(url: string) {
    try {
        const response = await fetchSyncPost("/api/network/forwardProxy", {
            url: url,
            method: "GET",
            timeout: 7000,
            contentType: "image/jpeg",
            headers: [
                {
                    name: "User-Agent",
                    value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
                },
            ],
            payload: {},
            payloadEncoding: "text",
            responseEncoding: "base64",
        });
        const contentType =
            response.data.headers["Content-Type"]?.[0] || "image/jpeg";
        return `data:${contentType};base64,${response.data.body}`;
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