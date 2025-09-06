import { fetchSyncPost } from "siyuan";
import { sql, setBlockAttrs } from "@/api";
import { changeMainKeyName } from './changeMainKeyName';
import { generateUniqueBlocked, parseDateToTimestamp } from '../core/formatOp';
import { getImage, downloadCover } from "@/utils/core/getImg";

export async function loadAVData(avID: string, fullData: any, plugin: any) {
    try {
        // 判断数据库中是否含有该书籍（以 ISBN 为依据）
        const originalDatabase = await fetchSyncPost("/api/av/getAttributeView", { "id": avID, });
        const originalDatabasekeyValues = originalDatabase.data.av.keyValues;

        // 检查数据库是否为空或不存在 ISBN 列
        if (originalDatabasekeyValues && Array.isArray(originalDatabasekeyValues)) {
            // 查找 ISBN 列
            const isbnKey = originalDatabasekeyValues.find((kv: any) => kv.key?.name === "ISBN");

            if (isbnKey && isbnKey.values && Array.isArray(isbnKey.values)) {
                // 检查是否已存在相同 ISBN 的书籍
                const existingBook = isbnKey.values.find((value: any) => {
                    return value.number && value.number.formattedContent === fullData.ISBN;
                });

                // 如果已存在相同 ISBN 的书籍，则退出不进行后续添加
                if (existingBook) {
                    return {
                        code: 1,
                        msg: "书籍已存在，跳过添加操作"
                    };
                }
            }
        }

        let databaseKeys: any;
        // 获取数据库详细列配置
        await fetchSyncPost("/api/av/getAttributeViewKeysByAvID", { avID: avID, }).then((res) => databaseKeys = res.data);

        // 检查数据库主键是否为书名
        if (databaseKeys[0].name !== "书名") { await changeMainKeyName(avID); }

        // 定义书籍属性列
        const requiredBookAttributes = ["书名", "封面", "副标题", "原作名", "作者", "译者", "出版社", "出版年", "出品方", "丛书", "ISBN", "豆瓣评分", "评分人数", "定价", "页数", "装帧", "我的评分", "书籍分类", "阅读状态", "开始日期", "读完日期",].reverse();

        // 检查数据库列中否存在书籍属性并添加缺失的书籍属性列
        for (const attributeName of requiredBookAttributes) {
            const existingAttribute = databaseKeys.find(key => key.name === attributeName);

            // 如果不存在，则添加该属性列
            if (!existingAttribute) {
                await fetchSyncPost("/api/av/addAttributeViewKey", {
                    avID: avID,
                    keyID: generateUniqueBlocked(),
                    keyName: attributeName,
                    keyType: getAttributeType(attributeName), // 根据属性名确定类型
                    keyIcon: "",
                    previousKeyID: databaseKeys.at(-1)?.id || "", // 在最后一个属性之后添加
                });
            }
        }

        // 获取更新后的数据库列配置
        await fetchSyncPost("/api/av/getAttributeViewKeysByAvID", {
            avID: avID,
        }).then((res) => databaseKeys = res.data);

        // 下载封面
        const coverBase64Data = await getImage(fullData.cover);
        fullData.cover = await downloadCover(coverBase64Data, fullData.title);

        // 构建书籍数据并添加到数据库
        const blocksValues = buildBlocksValues(databaseKeys, fullData);

        // 添加书籍数据到数据库
        await fetchSyncPost("/api/av/appendAttributeViewDetachedBlocksWithValues", {
            avID: avID,
            blocksValues: [blocksValues]
        });

        // 获取数据库信息并匹配新添加的书籍行的 blockID
        const updatedDatabase = await fetchSyncPost("/api/av/getAttributeView", { "id": avID, });
        const updatedDatabaseKeyValues = updatedDatabase.data.av.keyValues;

        // 查找 书名列
        const bookNameKeyNew = updatedDatabaseKeyValues.find((kv: any) => kv.key.name === "书名");
        let blockID = null;

        let matchingValue = null;
        if (bookNameKeyNew) {
            // 查找匹配 书名 的书籍
            matchingValue = bookNameKeyNew.values.find((value: any) => {
                return value.block && value.block.content === fullData.title;
            });

            if (matchingValue) {
                blockID = matchingValue.blockID;
            }
        }

        // 如果找不到 blockID，则抛出错误
        if (!blockID) {
            throw new Error("无法找到新添加书籍的 blockID");
        }

        // 创建读书笔记
        if (fullData.addNotes) {
            const sqlresult = await sql(`SELECT * FROM blocks WHERE id = "${fullData.databaseBlockId}"`);

            // 根据模板创建读书笔记
            const setting = await plugin.loadData("settings.json");
            const isSYTemplateRender = setting.isSYTemplateRender;
            if (!isSYTemplateRender) {
                const response = await fetchSyncPost('/api/filetree/createDocWithMd', {
                    id: blockID, // 使读书笔记文档ID与数据库ID一致
                    parentID: sqlresult[0].root_id,
                    notebook: sqlresult[0].box,
                    path: sqlresult[0].hpath + "/" + fullData.title,
                    markdown: fullData.noteTemplate
                        .replace(/{{书名}}/g, fullData.title || '无书名')
                        .replace(/{{副标题}}/g, fullData.subtitle || '')
                        .replace(/{{原作名}}/g, fullData.originalTitle || '')
                        .replace(/{{作者}}/g, Array.isArray(fullData.authors) ? fullData.authors.join('、') : '')
                        .replace(/{{译者}}/g, Array.isArray(fullData.translators) ? fullData.translators.join('、') : '')
                        .replace(/{{出版社}}/g, fullData.publisher || '未知出版社')
                        .replace(/{{出版年}}/g, fullData.publishDate || '未知日期')
                        .replace(/{{出品方}}/g, fullData.producer || '')
                        .replace(/{{ISBN}}/g, fullData.ISBN || '')
                        .replace(/{{装帧}}/g, fullData.binding || '')
                        .replace(/{{丛书}}/g, fullData.series || '')
                        .replace(/{{豆瓣评分}}/g, fullData.rating ? `${fullData.rating}` : '无评分')
                        .replace(/{{评分人数}}/g, fullData.ratingCount ? `${fullData.ratingCount}` : '0')
                        .replace(/{{页数}}/g, fullData.pages ? `${fullData.pages}` : '')
                        .replace(/{{定价}}/g, fullData.price ? `${fullData.price}` : '')
                        .replace(/{{我的评分}}/g, fullData.myRating || '未评分')
                        .replace(/{{书籍分类}}/g, fullData.bookCategory || '默认分类')
                        .replace(/{{阅读状态}}/g, fullData.readingStatus || '未读')
                        .replace(/{{开始日期}}/g, fullData.startDate || '未开始')
                        .replace(/{{读完日期}}/g, fullData.finishDate || '未完成')
                        .replace(/{{封面}}/g, fullData.cover || '')
                });

                // 检查读书笔记是否创建成功
                if (response.code !== 0) {
                    throw new Error(response.msg || "创建读书笔记失败");
                }
            } else {
                await fetchSyncPost('/api/filetree/createDocWithMd', {
                    id: blockID, // 使读书笔记文档ID与数据库ID一致
                    parentID: sqlresult[0].root_id,
                    notebook: sqlresult[0].box,
                    path: sqlresult[0].hpath + "/" + fullData.title,
                    markdown: ""
                });

                const template = fullData.noteTemplate
                    .replace(/{{书名}}/g, fullData.title || '无书名')
                    .replace(/{{副标题}}/g, fullData.subtitle || '')
                    .replace(/{{原作名}}/g, fullData.originalTitle || '')
                    .replace(/{{作者}}/g, Array.isArray(fullData.authors) ? fullData.authors.join('、') : '')
                    .replace(/{{译者}}/g, Array.isArray(fullData.translators) ? fullData.translators.join('、') : '')
                    .replace(/{{出版社}}/g, fullData.publisher || '未知出版社')
                    .replace(/{{出版年}}/g, fullData.publishDate || '未知日期')
                    .replace(/{{出品方}}/g, fullData.producer || '')
                    .replace(/{{ISBN}}/g, fullData.ISBN || '')
                    .replace(/{{装帧}}/g, fullData.binding || '')
                    .replace(/{{丛书}}/g, fullData.series || '')
                    .replace(/{{豆瓣评分}}/g, fullData.rating ? `${fullData.rating}` : '无评分')
                    .replace(/{{评分人数}}/g, fullData.ratingCount ? `${fullData.ratingCount}` : '暂无评价')
                    .replace(/{{页数}}/g, fullData.pages ? `${fullData.pages}` : '')
                    .replace(/{{定价}}/g, fullData.price ? `${fullData.price}` : '')
                    .replace(/{{我的评分}}/g, fullData.myRating || '未评分')
                    .replace(/{{书籍分类}}/g, fullData.bookCategory || '默认分类')
                    .replace(/{{阅读状态}}/g, fullData.readingStatus || '未读')
                    .replace(/{{开始日期}}/g, fullData.startDate || '未开始')
                    .replace(/{{读完日期}}/g, fullData.finishDate || '未完成')
                    .replace(/{{封面}}/g, fullData.cover || '')

                await plugin.saveData("noteTemplate.md", template);

                const res = await plugin.client.getConf();
                const dataDir = res.data.conf.system.dataDir;
                const respo = await plugin.client.render({
                    id: blockID,
                    path: dataDir + "/storage/petal/siyuan-douban/noteTemplate.md",
                });
                await plugin.client.updateBlock({
                    id: blockID,
                    data: respo.data.content,
                    dataType: "dom",
                })
            }

            // 给文档添加数据库属性链接
            await setBlockAttrs(blockID, {
                'custom-avs': avID
            });

            // 将数据库与读书笔记绑定
            await fetchSyncPost('/api/av/setAttributeViewBlockAttr', {
                "avID": avID,
                "keyID": matchingValue.keyID,
                "rowID": blockID,
                'value': {
                    "id": matchingValue.id,
                    "keyID": matchingValue.keyID,
                    "blockID": blockID,
                    "type": "block",
                    "isDetached": false,
                    "createdAt": matchingValue.createdAt,
                    "updatedAt": matchingValue.updatedAt,
                    "block": {
                        "id": blockID,
                        "content": matchingValue.block.content,
                        "created": matchingValue.block.created,
                        "updated": matchingValue.block.updated
                    }
                }
            })
        }

        return {
            code: 0,
            msg: "书籍添加成功"
        };
    } catch (error) {
        return {
            code: 1,
            msg: error.message || "未知错误",
            stack: error.stack
        };
    }
}

// ==== 定义属性列类型 ====
function getAttributeType(attributeName: string): string {
    switch (attributeName) {
        case "副标题":
        case "原作名":
        case "作者":
        case "译者":
        case "出版社":
        case "出品方":
        case "丛书":
        case "装帧":
            return "text";
        case "ISBN":
            return "number";
        case "豆瓣评分":
        case "评分人数":
        case "定价":
        case "页数":
            return "number";
        case "我的评分":
        case "书籍分类":
        case "阅读状态":
            return "select";
        case "出版年":
        case "开始日期":
        case "读完日期":
            return "date";
        case "封面":
            return "mAsset";
    }
}

// ==== 构建添加书籍的属性列值 ====
function buildBlocksValues(databaseKeys: any[], fullData: any) {
    const blockValues = [];

    // 处理每个属性列
    for (const key of databaseKeys) {
        const keyValue: any = {
            keyID: key.id,
            name: key.name
        };

        switch (key.name) {
            case "书名":
                keyValue.block = {
                    content: fullData.title || ""
                };
                break;

            case "副标题":
                keyValue.text = {
                    content: fullData.subtitle || ""
                };
                break;

            case "原作名":
                keyValue.text = {
                    content: fullData.originalTitle || ""
                };
                break;

            case "作者":
                keyValue.text = {
                    content: Array.isArray(fullData.authors) ? fullData.authors.join(', ') : ""
                };
                break;

            case "译者":
                keyValue.text = {
                    content: Array.isArray(fullData.translators) ? fullData.translators.join(', ') : ""
                };
                break;

            case "出版社":
                keyValue.text = {
                    content: fullData.publisher || ""
                };
                break;

            case "出品方":
                keyValue.text = {
                    content: fullData.producer || ""
                };
                break;

            case "丛书":
                keyValue.text = {
                    content: fullData.series || ""
                };
                break;

            case "装帧":
                keyValue.text = {
                    content: fullData.binding || ""
                };
                break;

            case "ISBN":
                keyValue.number = {
                    content: fullData.ISBN ? Number(fullData.ISBN) : null,
                    formattedContent: fullData.ISBN || "",
                    isNotEmpty: true
                };
                break;

            case "豆瓣评分":
                keyValue.number = {
                    content: fullData.rating ? Number(fullData.rating) : null,
                    formattedContent: fullData.rating || "",
                    isNotEmpty: true
                };
                break;

            case "评分人数":
                keyValue.number = {
                    content: fullData.ratingCount ? Number(fullData.ratingCount) : null,
                    formattedContent: fullData.ratingCount || "",
                    isNotEmpty: true
                };
                break;

            case "定价":
                keyValue.number = {
                    content: fullData.price ? Number(fullData.price) : null,
                    formattedContent: fullData.price || "",
                    isNotEmpty: true
                };
                break;

            case "页数":
                keyValue.number = {
                    content: fullData.pages ? Number(fullData.pages) : null,
                    formattedContent: fullData.pages || "",
                    isNotEmpty: true
                };
                break;

            case "出版年":
                keyValue.date = {
                    content: fullData.publishDate ? parseDateToTimestamp(fullData.publishDate) : null,
                    isNotEmpty: !!fullData.publishDate,
                    isNotTime: true
                };
                break;

            case "开始日期":
                keyValue.date = {
                    content: fullData.startDate ? parseDateToTimestamp(fullData.startDate) : null,
                    isNotEmpty: !!fullData.startDate,
                    isNotTime: true
                };
                break;

            case "读完日期":
                keyValue.date = {
                    content: fullData.finishDate ? parseDateToTimestamp(fullData.finishDate) : null,
                    isNotEmpty: !!fullData.finishDate,
                    isNotTime: true
                };
                break;

            case "封面":
                if (fullData.cover) {
                    keyValue.mAsset = [{
                        content: fullData.cover,
                        type: "image"
                    }];
                } else {
                    keyValue.mAsset = [];
                }
                break;

            case "我的评分":
                keyValue.mSelect = [{
                    content: fullData.myRating || ""
                }];
                break;

            case "书籍分类":
                keyValue.mSelect = [{
                    content: fullData.bookCategory || ""
                }];
                break;

            case "阅读状态":
                keyValue.mSelect = [{
                    content: fullData.readingStatus || ""
                }];
                break;

            default:
                // 对于未处理的字段，添加空值
                const keyType = key.type;
                switch (keyType) {
                    case "text":
                        keyValue.text = {};
                        break;
                    case "number":
                        keyValue.number = {};
                        break;
                    case "date":
                        keyValue.date = {};
                        break;
                    case "select":
                        keyValue.mSelect = [];
                        break;
                    case "mAsset":
                        keyValue.mAsset = [];
                        break;
                    case "block":
                        keyValue.block = {};
                        break;
                    default:
                        keyValue.text = {};
                }
        }

        blockValues.push(keyValue);
    }

    return blockValues;
}