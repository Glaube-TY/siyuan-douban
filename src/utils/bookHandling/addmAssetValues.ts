import { formatTime, generateUniqueBlocked } from '../core/formatOp';
const fs = require('fs');
const path = require('path');
const https = require('https');

export async function downloadCover(url: string, title: string, workspacePath: string) {
    if (!url || !url.startsWith('https://')) {
        throw new Error('仅支持 HTTPS 协议下载封面');
    }

    const cleanTitle = title.replace(/[^\w\u4e00-\u9fa5]/g, '_');
    const timestamp = formatTime();

    // 创建封面存储目录
    const coverDir = path.join(workspacePath, 'data/assets/covers');
    if (!fs.existsSync(coverDir)) {
        fs.mkdirSync(coverDir, { recursive: true });
    }

    // 生成带扩展名的文件名
    const fileExt = url.split('.').pop()?.split(/[#?]/)[0] || 'jpg';
    const coverPath = path.join(coverDir, `${cleanTitle}_${timestamp}.${fileExt}`);

    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (response) => {
            const fileStream = fs.createWriteStream(coverPath);
            response.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                resolve(`assets/covers/${cleanTitle}_${timestamp}.${fileExt}`);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
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