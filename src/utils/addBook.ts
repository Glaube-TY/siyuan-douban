import { fetchSyncPost } from "siyuan";
import { sql, setBlockAttrs } from "../api";

export async function loadAVData(avID: string, fullData: any) {
    const fs = require('fs');
    const workspacePath = window.siyuan.config.system.workspaceDir;

    // 封装格式化时间戳函数
    function formatTime() {
        const now = new Date();
        return [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
            String(now.getSeconds()).padStart(2, '0')
        ].join('');
    }

    // 将日期字符串转换为时间戳
    function parseDateToTimestamp(dateStr: string): number {
        if (!dateStr) return 0;
        // 支持格式：YYYY、YYYY-MM、YYYY-MM-DD
        const formats = [
            /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD
            /^(\d{4})-(\d{1,2})$/,          // YYYY-MM
            /^(\d{4})$/,                     // YYYY
            /^(\d{4})年(\d{1,2})月(\d{1,2})日$/, // 中文日期
            /^(\d{4})年(\d{1,2})月$/,        // 中文年月
            /^(\d{4})年$/                    // 中文年
        ];

        let year = 0, month = 0, day = 0;

        for (const regex of formats) {
            const match = dateStr.match(regex);
            if (match) {
                year = parseInt(match[1]);
                month = match[2] ? parseInt(match[2]) - 1 : 0; // 月份从0开始
                day = match[3] ? parseInt(match[3]) : 1;
                break;
            }
        }

        // 如果都没匹配到，返回当前时间戳
        if (!year) return 0;

        return new Date(year, month, day).getTime();
    }

    // 将字符串中的数字提取出来（保留小数点）
    function cleanNumberString(numStr: string): number {
        if (!numStr) return 0;
        // 允许数字和小数点，替换所有非数字和小数点字符
        const cleaned = numStr.replace(/[^\d.]/g, '');
        // 处理多个小数点的情况（如 "12.34.56" → "12.34"）
        const validNumber = cleaned.replace(/\.+$/, '').replace(/^\.+/, '')
            .replace(/\.(?=.*\.)/g, '');
        return parseFloat(validNumber) || 0;
    }

    // 封装随机字符生成函数
    function generateRandomId(length = 7) {
        const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
        return Array.from({ length }, () =>
            chars[Math.floor(Math.random() * chars.length)]
        ).join('');
    }

    function generateUniqueBlocked() {
        const timestamp = formatTime(); // 使用格式化时间戳
        const randomId = generateRandomId(); // 使用随机字符生成
        return `${timestamp}-${randomId}`; // 拼接成唯一ID 
    }

    try {
        // 读取原始数据库文件
        const fullPath = `${workspacePath}/data/storage/av/${avID}.json`;
        const response = await fetch(`file://${fullPath}`);
        const jsonData = await response.json();


        let uniqueBlockId; // 生成或获取文档ID
        let isDetached = true; // 用于控制链接到读书笔记
        if (fullData.addNotes) {
            // 创建读书笔记文档
            // 下载封面
            fullData.cover = await downloadCover(fullData.cover, fullData.title);
            const sqlresult = await sql(`SELECT * FROM blocks WHERE id = "${fullData.databaseBlockId}"`);
            const notebookId = sqlresult[0].box;
            const docPath = sqlresult[0].hpath + "/";
            const response = await fetchSyncPost('/api/filetree/createDocWithMd', {
                notebook: notebookId,
                path: docPath,
                markdown: fullData.noteTemplate
                    // 基本元数据
                    .replace(/{{书名}}/g, fullData.title || '无书名')
                    .replace(/{{副标题}}/g, fullData.subtitle || '')
                    .replace(/{{原作名}}/g, fullData.originalTitle || '')
                    // 作者/译者处理
                    .replace(/{{作者}}/g, Array.isArray(fullData.authors) ? fullData.authors.join('、') : '')
                    .replace(/{{译者}}/g, Array.isArray(fullData.translators) ? fullData.translators.join('、') : '')
                    // 出版信息
                    .replace(/{{出版社}}/g, fullData.publisher || '未知出版社')
                    .replace(/{{出版年}}/g, fullData.publishDate || '未知日期')
                    .replace(/{{出品方}}/g, fullData.producer || '')
                    // ISBN和装帧
                    .replace(/{{ISBN}}/g, fullData.ISBN || '')
                    .replace(/{{装帧}}/g, fullData.binding || '')
                    // 丛书系列
                    .replace(/{{丛书}}/g, fullData.series || '')
                    // 豆瓣数据
                    .replace(/{{豆瓣评分}}/g, fullData.rating ? `${fullData.rating}` : '无评分')
                    .replace(/{{评分人数}}/g, fullData.ratingCount ? `${fullData.ratingCount}` : '暂无评价')
                    // 物理信息
                    .replace(/{{页数}}/g, fullData.pages ? `${fullData.pages}` : '')
                    .replace(/{{定价}}/g, fullData.price ? `${fullData.price}` : '')
                    // 阅读信息
                    .replace(/{{我的评分}}/g, fullData.myRating || '未评分')
                    .replace(/{{书籍分类}}/g, fullData.bookCategory || '默认分类')
                    .replace(/{{阅读状态}}/g, fullData.readingStatus || '未读')
                    .replace(/{{开始日期}}/g, fullData.startDate || '未开始')
                    .replace(/{{读完日期}}/g, fullData.finishDate || '未完成')
                    // 封面图片
                    .replace(/{{封面}}/g, fullData.cover || '')
            });
            if (response.code !== 0) {
                throw new Error(response.msg || "创建读书笔记失败");
            }
            uniqueBlockId = response.data;
            // 重命名文档标题
            await fetchSyncPost('/api/filetree/renameDocByID', {
                id: uniqueBlockId,
                title: fullData.title,
            });
            if (response.code !== 0) {
                throw new Error(`重命名失败: ${response.msg}`);
            }
            // 设置关联数据库属性
            await setBlockAttrs(uniqueBlockId, {
                'custom-avs': avID
            });
            isDetached = false;
        } else {
            // 下载封面
            fullData.cover = await downloadCover(fullData.cover, fullData.title);
            uniqueBlockId = generateUniqueBlocked();
        }



        // 将书籍ID添加到rowIds数组
        if (!jsonData.views[0].table.rowIds) {
            jsonData.views[0].table.rowIds = []; // 初始化数组
        }
        jsonData.views[0].table.rowIds.push(uniqueBlockId);

        // 执行添加函数
        await addTitle();
        await addSubtitle();
        await addAuthor();
        await addOriginalTitle();
        await addCover();
        await addTranslator();
        await addPublisher();
        await addPublishDate();
        await addProducer();
        await addSeries();
        await addISBN();
        await addRating();
        await addRatingCount();
        await addPrice();
        await addPages();
        await addBinding();
        await addMyRating();
        await addCategory();
        await addReadStatus();
        await addStartDate();
        await addFinishDate();

        // 导入书名
        function addTitle() {
            // 检查主键名称是否是"书名"
            if (jsonData.keyValues[0].key.name !== "书名") {
                jsonData.keyValues[0].key.name = "书名";
            }
            if (!jsonData.keyValues[0].values) {
                jsonData.keyValues[0].values = [];
            }
            // 创建新书籍书名对象
            const newBookTitle = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues[0].key.id,
                blockID: uniqueBlockId,
                type: "block",
                isDetached: isDetached,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                block: {
                    id: uniqueBlockId,
                    icon: "",
                    content: fullData.title,
                    created: Date.now(),
                    updated: Date.now()
                }
            };
            // 将新书名添加到values数组
            jsonData.keyValues[0].values.push(newBookTitle);
            return jsonData;
        }

        // 导入副标题
        function addSubtitle() {
            // 检查是否有"副标题"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "副标题");
            // 如果没有"副标题"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "副标题",
                        type: "text",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将副标题列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "副标题").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"副标题"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "副标题").values) {
                jsonData.keyValues.find(item => item.key.name === "副标题").values = [];
            }
            // // 创建新副标题对象
            const newSubtitle = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "副标题").key.id,
                blockID: uniqueBlockId,
                type: "text",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                text: {
                    content: fullData.subtitle,
                }
            }
            // 将新副标题添加到values数组
            jsonData.keyValues.find(item => item.key.name === "副标题").values.push(newSubtitle);
            return jsonData;
        }

        // 导入原作名
        function addOriginalTitle() {
            // 检查是否有"原作名"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "原作名");
            // 如果没有"原作名"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "原作名",
                        type: "text",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将原作名列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "原作名").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"原作名"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "原作名").values) {
                jsonData.keyValues.find(item => item.key.name === "原作名").values = [];
            }
            // // 创建新原作名对象
            const newOriginalTitle = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "原作名").key.id,
                blockID: uniqueBlockId,
                type: "text",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                text: {
                    content: fullData.originalTitle,
                }
            }
            // 将新原作名添加到values数组
            jsonData.keyValues.find(item => item.key.name === "原作名").values.push(newOriginalTitle);
            return jsonData;
        }

        async function downloadCover(url: string, title: string) {
            const path = require('path');
            const https = require('https');

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

        // 导入封面
        async function addCover() {
            // 检查是否有"封面"列
            const coverColumn = jsonData.keyValues.find(item => item.key.name === "封面");
            // 如果没有"封面"列，创建新列
            if (!coverColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "封面",
                        type: "mAsset",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将封面列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "封面").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": "40px"
                });
            }
            // 检查是否有"封面"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "封面").values) {
                jsonData.keyValues.find(item => item.key.name === "封面").values = [];
            }
            // // 创建新封面对象
            const newCover = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "封面").key.id,
                blockID: uniqueBlockId,
                type: "mAsset",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                mAsset: [{  // 修改为数组格式
                    type: "image",
                    name: "",
                    content: fullData.cover
                }]
            }
            // 将新原作名添加到values数组
            jsonData.keyValues.find(item => item.key.name === "封面").values.push(newCover);
            return jsonData;
        }

        // 导入作者
        function addAuthor() {
            // 检查是否有"作者"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "作者");
            // 如果没有"作者"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "作者",
                        type: "text",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将作者列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "作者").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"作者"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "作者").values) {
                jsonData.keyValues.find(item => item.key.name === "作者").values = [];
            }
            // // 创建新作者对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "作者").key.id,
                blockID: uniqueBlockId,
                type: "text",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                text: {
                    content: Array.isArray(fullData.authors)
                        ? fullData.authors.join(', ')  // 将数组转换为逗号分隔字符串
                        : fullData.authors || '',       // 处理undefined/null情况
                }
            }
            // 将新作者添加到values数组
            jsonData.keyValues.find(item => item.key.name === "作者").values.push(newAuthor);
            return jsonData;
        }

        // 导入译者
        function addTranslator() {
            // 检查是否有"译者"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "译者");
            // 如果没有"译者"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "译者",
                        type: "text",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将译者列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "译者").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"译者"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "译者").values) {
                jsonData.keyValues.find(item => item.key.name === "译者").values = [];
            }
            // // 创建新译者对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "译者").key.id,
                blockID: uniqueBlockId,
                type: "text",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                text: {
                    content: Array.isArray(fullData.translators)
                        ? fullData.translators.join(', ')  // 将数组转换为逗号分隔字符串
                        : fullData.translators || '',       // 处理undefined/null情况
                }
            }
            // 将新译者添加到values数组
            jsonData.keyValues.find(item => item.key.name === "译者").values.push(newAuthor);
            return jsonData;
        }

        // 导入出版社
        function addPublisher() {
            // 检查是否有"出版社"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "出版社");
            // 如果没有"出版社"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "出版社",
                        type: "text",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将出版社列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "出版社").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"出版社"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "出版社").values) {
                jsonData.keyValues.find(item => item.key.name === "出版社").values = [];
            }
            // // 创建新出版社对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "出版社").key.id,
                blockID: uniqueBlockId,
                type: "text",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                text: {
                    content: fullData.publisher,
                }
            }
            // 将新出版社添加到values数组
            jsonData.keyValues.find(item => item.key.name === "出版社").values.push(newAuthor);
            return jsonData;
        }

        // 导入出版年
        function addPublishDate() {
            if (!fullData.publishDate) return;
            // 检查是否有"出版年"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "出版年");
            // 如果没有"出版年"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "出版年",
                        type: "date",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将出版年列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "出版年").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"出版年"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "出版年").values) {
                jsonData.keyValues.find(item => item.key.name === "出版年").values = [];
            }
            // 将日期字符串转换为时间戳
            const timestamp = parseDateToTimestamp(fullData.publishDate);
            // 创建新出版年对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "出版年").key.id,
                blockID: uniqueBlockId,
                type: "date",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                date: {
                    content: timestamp,
                    isNotEmpty: true,
                    hasEndDate: false,
                    isNotTime: true,
                    content2: 0,
                    isNotEmpty2: false,
                    formattedContent: ""
                }
            }
            // 将新出版年添加到values数组
            jsonData.keyValues.find(item => item.key.name === "出版年").values.push(newAuthor);
            return jsonData;
        }

        // 导入出品方
        function addProducer() {
            // 检查是否有"出品方"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "出品方");
            // 如果没有"出品方"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "出品方",
                        type: "text",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将出品方列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "出品方").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"出品方"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "出品方").values) {
                jsonData.keyValues.find(item => item.key.name === "出品方").values = [];
            }
            // // 创建新出品方对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "出品方").key.id,
                blockID: uniqueBlockId,
                type: "text",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                text: {
                    content: fullData.producer,
                }
            }
            // 将新出品方添加到values数组
            jsonData.keyValues.find(item => item.key.name === "出品方").values.push(newAuthor);
            return jsonData;
        }

        // 导入丛书
        function addSeries() {
            // 检查是否有"丛书"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "丛书");
            // 如果没有"丛书"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "丛书",
                        type: "text",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将丛书列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "丛书").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"丛书"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "丛书").values) {
                jsonData.keyValues.find(item => item.key.name === "丛书").values = [];
            }
            // // 创建新丛书对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "丛书").key.id,
                blockID: uniqueBlockId,
                type: "text",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                text: {
                    content: fullData.series,
                }
            }
            // 将新丛书添加到values数组
            jsonData.keyValues.find(item => item.key.name === "丛书").values.push(newAuthor);
            return jsonData;
        }

        // 导入ISBN
        function addISBN() {
            // 检查是否有"丛书"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "ISBN");
            // 如果没有"丛书"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "ISBN",
                        type: "number",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将ISBN列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "ISBN").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"ISBN"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "ISBN").values) {
                jsonData.keyValues.find(item => item.key.name === "ISBN").values = [];
            }
            // // 创建新ISBN对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "ISBN").key.id,
                blockID: uniqueBlockId,
                type: "number",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                number: {
                    content: cleanNumberString(fullData.ISBN),
                    isNotEmpty: true,
                    format: "",
                    formattedContent: fullData.ISBN
                }
            }
            // 将新ISBN添加到values数组
            jsonData.keyValues.find(item => item.key.name === "ISBN").values.push(newAuthor);
            return jsonData;
        }

        // 导入豆瓣评分
        function addRating() {
            // 检查是否有"豆瓣评分"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "豆瓣评分");
            // 如果没有"豆瓣评分"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "豆瓣评分",
                        type: "number",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将豆瓣评分列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "豆瓣评分").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"豆瓣评分"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "豆瓣评分").values) {
                jsonData.keyValues.find(item => item.key.name === "豆瓣评分").values = [];
            }
            // // 创建新豆瓣评分对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "豆瓣评分").key.id,
                blockID: uniqueBlockId,
                type: "number",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                number: {
                    content: cleanNumberString(fullData.rating),
                    isNotEmpty: true,
                    format: "",
                    formattedContent: fullData.rating
                }
            }
            // 将新豆瓣评分添加到values数组
            jsonData.keyValues.find(item => item.key.name === "豆瓣评分").values.push(newAuthor);
            return jsonData;
        }

        // 导入评分人数
        function addRatingCount() {
            // 检查是否有"评分人数"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "评分人数");
            // 如果没有"评分人数"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "评分人数",
                        type: "number",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将评分人数列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "评分人数").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"评分人数"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "评分人数").values) {
                jsonData.keyValues.find(item => item.key.name === "评分人数").values = [];
            }
            // // 创建新评分人数对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "评分人数").key.id,
                blockID: uniqueBlockId,
                type: "number",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                number: {
                    content: cleanNumberString(fullData.ratingCount),
                    isNotEmpty: true,
                    format: "",
                    formattedContent: fullData.ratingCount
                }
            }
            // 将新评分人数添加到values数组
            jsonData.keyValues.find(item => item.key.name === "评分人数").values.push(newAuthor);
            return jsonData;
        }

        // 导入定价
        function addPrice() {
            // 检查是否有"定价"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "定价");
            // 如果没有"定价"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "定价",
                        type: "number",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将定价列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "定价").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"定价"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "定价").values) {
                jsonData.keyValues.find(item => item.key.name === "定价").values = [];
            }
            // // 创建新定价对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "定价").key.id,
                blockID: uniqueBlockId,
                type: "number",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                number: {
                    content: cleanNumberString(fullData.price),
                    isNotEmpty: true,
                    format: "",
                    formattedContent: fullData.price
                }
            }
            // 将新定价添加到values数组
            jsonData.keyValues.find(item => item.key.name === "定价").values.push(newAuthor);
            return jsonData;
        }

        // 导入页数
        function addPages() {
            // 检查是否有"页数"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "页数");
            // 如果没有"页数"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "页数",
                        type: "number",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将页数列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "页数").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"页数"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "页数").values) {
                jsonData.keyValues.find(item => item.key.name === "页数").values = [];
            }
            // // 创建新页数对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "页数").key.id,
                blockID: uniqueBlockId,
                type: "number",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                number: {
                    content: cleanNumberString(fullData.pages),
                    isNotEmpty: true,
                    format: "",
                    formattedContent: fullData.pages
                }
            }
            // 将新定价添加到values数组
            jsonData.keyValues.find(item => item.key.name === "页数").values.push(newAuthor);
            return jsonData;
        }

        // 导入装帧
        function addBinding() {
            // 检查是否有"装帧"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "装帧");
            // 如果没有"装帧"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "装帧",
                        type: "text",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将装帧列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "装帧").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"装帧"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "装帧").values) {
                jsonData.keyValues.find(item => item.key.name === "装帧").values = [];
            }
            // // 创建新装帧对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "装帧").key.id,
                blockID: uniqueBlockId,
                type: "text",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                text: {
                    content: fullData.binding,
                }
            }
            // 将新装帧添加到values数组
            jsonData.keyValues.find(item => item.key.name === "装帧").values.push(newAuthor);
            return jsonData;
        }

        // 导入我的评分
        function addMyRating() {
            // 检查是否有"我的评分"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "我的评分");
            // 如果没有"我的评分"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "我的评分",
                        type: "select",
                        icon: "",
                        desc: "",
                        options: [],
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将我的评分列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "我的评分").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"我的评分"列的options数组
            if (!jsonData.keyValues.find(item => item.key.name === "我的评分").key.options.find(item => item.name === fullData.myRating)) {
                jsonData.keyValues.find(item => item.key.name === "我的评分").key.options.push({
                    name: fullData.myRating,
                    color: "",
                    desc: "",
                })
            }
            // 检查是否有"我的评分"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "我的评分").values) {
                jsonData.keyValues.find(item => item.key.name === "我的评分").values = [];
            }
            // // 创建新我的评分对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "我的评分").key.id,
                blockID: uniqueBlockId,
                type: "select",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                mSelect: [{
                    content: fullData.myRating,
                    color: "",
                }]
            }
            // 将新装帧添加到values数组
            jsonData.keyValues.find(item => item.key.name === "我的评分").values.push(newAuthor);
            return jsonData;
        }

        // 导入书籍分类
        function addCategory() {
            // 检查是否有"书籍分类"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "书籍分类");
            // 如果没有"书籍分类"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "书籍分类",
                        type: "select",
                        icon: "",
                        desc: "",
                        options: [],
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将书籍分类列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "书籍分类").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"书籍分类"列的options数组
            if (!jsonData.keyValues.find(item => item.key.name === "书籍分类").key.options.find(item => item.name === fullData.bookCategory)) {
                jsonData.keyValues.find(item => item.key.name === "书籍分类").key.options.push({
                    name: fullData.bookCategory,
                    color: "",
                    desc: "",
                })
            }
            // 检查是否有"书籍分类"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "书籍分类").values) {
                jsonData.keyValues.find(item => item.key.name === "书籍分类").values = [];
            }
            // // 创建新书籍分类对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "书籍分类").key.id,
                blockID: uniqueBlockId,
                type: "select",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                mSelect: [{
                    content: fullData.bookCategory,
                    color: "",
                }]
            }
            // 将新书籍分类添加到values数组
            jsonData.keyValues.find(item => item.key.name === "书籍分类").values.push(newAuthor);
            return jsonData;
        }

        // 导入阅读状态
        function addReadStatus() {
            // 检查是否有"阅读状态"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "阅读状态");
            // 如果没有"阅读状态"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "阅读状态",
                        type: "select",
                        icon: "",
                        desc: "",
                        options: [],
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将阅读状态列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "阅读状态").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"阅读状态"列的options数组
            if (!jsonData.keyValues.find(item => item.key.name === "阅读状态").key.options.find(item => item.name === fullData.readingStatus)) {
                jsonData.keyValues.find(item => item.key.name === "阅读状态").key.options.push({
                    name: fullData.readingStatus,
                    color: "",
                    desc: "",
                })
            }
            // 检查是否有"阅读状态"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "阅读状态").values) {
                jsonData.keyValues.find(item => item.key.name === "阅读状态").values = [];
            }
            // // 创建新阅读状态对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "阅读状态").key.id,
                blockID: uniqueBlockId,
                type: "select",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                mSelect: [{
                    content: fullData.readingStatus,
                    color: "",
                }]
            }
            // 将新阅读状态添加到values数组
            jsonData.keyValues.find(item => item.key.name === "阅读状态").values.push(newAuthor);
            return jsonData;
        }

        // 导入开始日期 
        function addStartDate() {
            if (!fullData.startDate) return;
            // 检查是否有"开始日期"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "开始日期");
            // 如果没有"开始日期"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "开始日期",
                        type: "date",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将开始日期列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "开始日期").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"开始日期"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "开始日期").values) {
                jsonData.keyValues.find(item => item.key.name === "开始日期").values = [];
            }
            // 将日期字符串转换为时间戳
            const timestamp = parseDateToTimestamp(fullData.startDate) || Date.now();
            // 创建新开始日期对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "开始日期").key.id,
                blockID: uniqueBlockId,
                type: "date",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                date: {
                    content: timestamp,
                    isNotEmpty: true,
                    hasEndDate: false,
                    isNotTime: true,
                    content2: 0,
                    isNotEmpty2: false,
                    formattedContent: ""
                }
            }
            // 将新开始日期添加到values数组
            jsonData.keyValues.find(item => item.key.name === "开始日期").values.push(newAuthor);
            return jsonData;
        }

        // 导入读完日期
        function addFinishDate() {
            if (!fullData.finishDate) return;
            // 检查是否有"读完日期"列
            const authorColumn = jsonData.keyValues.find(item => item.key.name === "读完日期");
            // 如果没有"读完日期"列，创建新列
            if (!authorColumn) {
                jsonData.keyValues.push({
                    key: {
                        id: generateUniqueBlocked(),
                        name: "读完日期",
                        type: "date",
                        icon: "",
                        desc: "",
                        numberFormat: "",
                        template: ""
                    },
                })
                // 将读完日期列显示出来
                jsonData.views[0].table.columns.push({
                    "id": jsonData.keyValues.find(item => item.key.name === "读完日期").key.id,
                    "wrap": false,
                    "hidden": false,
                    "pin": false,
                    "width": ""
                });
            }
            // 检查是否有"读完日期"列的values数组
            if (!jsonData.keyValues.find(item => item.key.name === "读完日期").values) {
                jsonData.keyValues.find(item => item.key.name === "读完日期").values = [];
            }
            // 将日期字符串转换为时间戳
            const timestamp = parseDateToTimestamp(fullData.finishDate) || Date.now();
            // 创建新读完日期对象
            const newAuthor = {
                id: generateUniqueBlocked(),
                keyID: jsonData.keyValues.find(item => item.key.name === "读完日期").key.id,
                blockID: uniqueBlockId,
                type: "date",
                createdAt: Date.now(),
                updatedAt: Date.now(),
                date: {
                    content: timestamp,
                    isNotEmpty: true,
                    hasEndDate: false,
                    isNotTime: true,
                    content2: 0,
                    isNotEmpty2: false,
                    formattedContent: ""
                }
            }
            // 将新读完日期添加到values数组
            jsonData.keyValues.find(item => item.key.name === "读完日期").values.push(newAuthor);
            return jsonData;
        }

        fs.writeFileSync(
            fullPath, // 写入同一文件路径
            JSON.stringify(jsonData, null, 2), // 保持格式化的JSON
            'utf-8'
        );
    } catch (error) {
        return {
            code: 1,
            msg: error.message || "未知错误",
            stack: error.stack
        };
    }
}
