import { formatTime, generateUniqueBlocked } from '../core/formatOp';
import { fetchSyncPost } from "siyuan";

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

export function addCover(jsonData: any, uniqueBlockId: string, coverUrl: string) {
    // 查找或创建封面列
    let column = jsonData.keyValues.find(item => item.key.name === "封面");
    if (!column) {
        const newKey = {
            key: {
                id: generateUniqueBlocked(),
                name: "封面",
                type: "mAsset",
                icon: "",
                desc: "",
                numberFormat: "",
                template: ""
            }
        };
        jsonData.keyValues.push(newKey);

        // 添加列到视图
        jsonData.views[0].table.columns.push({
            id: newKey.key.id,
            wrap: false,
            hidden: false,
            pin: false,
            width: "40px"
        });
    }

    // 初始化values数组
    const targetColumn = jsonData.keyValues.find(item => item.key.name === "封面");
    if (!targetColumn.values) {
        targetColumn.values = [];
    }

    // 创建新封面对象
    const newCover = {
        id: generateUniqueBlocked(),
        keyID: targetColumn.key.id,
        blockID: uniqueBlockId,
        type: "mAsset",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        mAsset: [{
            type: "image",
            name: "",
            content: coverUrl
        }]
    };

    targetColumn.values.push(newCover);
    return jsonData;
}