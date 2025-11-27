import { fetchSyncPost } from "siyuan";
import { changeMainKeyName } from '../bookHandling/changeMainKeyName';
import { generateUniqueBlocked, parseDateToTimestamp } from '../core/formatOp';
import { sql, setBlockAttrs } from "@/api";
import { getImage, downloadCover } from "@/utils/core/getImg";

// 添加 useBookID 书籍到数据库
export async function addUseBookIDsToDatabase(plugin: any, avID: string, bookDetail: any) {
    let getdatabase = await fetchSyncPost('/api/av/getAttributeView', { "id": avID });
    let originalDatabasekeyValues = getdatabase.data.av.keyValues;
    console.log(originalDatabasekeyValues);

    // 检查数据库是否为空或不存在 bookID 列
    if (originalDatabasekeyValues && Array.isArray(originalDatabasekeyValues)) {
        // 查找 bookID 列
        const bookIDKey = originalDatabasekeyValues.find((kv: any) => kv.key?.name === "bookID");
        const bookNameKey = originalDatabasekeyValues.find((kv: any) => kv.key?.name === "书名");

        // 处理异常情况
        // 当用户直接删除读书笔记文档，数据库视图会同步删除，但是本地数据库文件中还保留了除书名以外的其他列内容
        if (bookIDKey && bookNameKey) {
            const bookIDColumn = bookIDKey.values || [];
            const bookNameColumn = bookNameKey.values || [];

            // 对比bookNameColumn与bookIDColumn，若他俩存在不同的，则将不同的blockID用removeAttributeViewBlocks方法清理
            const bookNameBlockIDs = new Set(bookNameColumn.map((item: any) => item.blockID));
            const bookIDBlockIDs = new Set(bookIDColumn.map((item: any) => item.blockID));

            // 找出在bookID列中但不在书名列中的blockID
            const blockIDsToRemove = Array.from(bookIDBlockIDs).filter(id => !bookNameBlockIDs.has(id) && id !== undefined);

            // 如果有需要清理的blockID，则调用removeAttributeViewBlocks方法
            if (blockIDsToRemove.length > 0) {
                await fetchSyncPost('/api/av/removeAttributeViewBlocks', { "avID": avID, "srcIDs": blockIDsToRemove });
                console.log(`清理了 ${blockIDsToRemove.length} 个不匹配的blockID`);

                // 重新获取数据库信息
                getdatabase = await fetchSyncPost("/api/av/getAttributeView", { "id": avID, });
                originalDatabasekeyValues = getdatabase.data.av.keyValues;
            }
        }

        // 查找 bookID 列
        const updatedBookIDKey = originalDatabasekeyValues.find((kv: any) => kv.key?.name === "bookID");

        if (updatedBookIDKey && updatedBookIDKey.values && Array.isArray(updatedBookIDKey.values)) {
            // 检查是否已存在相同 bookID 的书籍
            const existingBook = updatedBookIDKey.values.find((value: any) => {
                return value.text.content === bookDetail.bookId;
            });

            // 如果已存在相同 bookID 的书籍，则退出不进行后续添加
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
    const requiredBookAttributes = ["书名", "封面", "作者", "译者", "出版社", "出版年", "ISBN", "定价", "书籍分类", "微信读书评分", "微信读书评分人数", "bookID"].reverse();

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
    const coverBase64Data = await getImage(bookDetail.cover);
    bookDetail.cover = await downloadCover(coverBase64Data, bookDetail.title);

    // 构建书籍数据并添加到数据库
    const blocksValues = buildBlocksValues(databaseKeys, bookDetail);

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
            return value.block && value.block.content === bookDetail.title;
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
    const sqlresult = await sql(`SELECT * FROM blocks WHERE id = "${blockID}"`);

    // 根据模板创建读书笔记
    const setting = await plugin.loadData("settings.json");
    const isSYTemplateRender = setting.isSYTemplateRender;
    const noteTemplate = await plugin.loadData("noteTemplate.md");
    if (!isSYTemplateRender) {
        const response = await fetchSyncPost('/api/filetree/createDocWithMd', {
            id: blockID, // 使读书笔记文档ID与数据库ID一致
            parentID: sqlresult[0].root_id,
            notebook: sqlresult[0].box,
            path: sqlresult[0].hpath + "/" + bookDetail.title,
            markdown: noteTemplate
                .replace(/{{书名}}/g, bookDetail.title || '无书名')
                .replace(/{{副标题}}/g, bookDetail.subtitle || '')
                .replace(/{{原作名}}/g, bookDetail.originalTitle || '')
                .replace(/{{作者}}/g, bookDetail.authors || '')
                .replace(/{{译者}}/g, bookDetail.translators || '')
                .replace(/{{出版社}}/g, bookDetail.copyrightInfo?.name || bookDetail.publisher || '未知出版社')
                .replace(/{{出版年}}/g, bookDetail.publishDate || '未知日期')
                .replace(/{{出品方}}/g, bookDetail.producer || '')
                .replace(/{{ISBN}}/g, bookDetail.isbn || '')
                .replace(/{{装帧}}/g, bookDetail.format || '')
                .replace(/{{丛书}}/g, bookDetail.series || '')
                .replace(/{{页数}}/g, bookDetail.pages ? `${bookDetail.pages}` : '')
                .replace(/{{定价}}/g, bookDetail.centPrice ? `${bookDetail.centPrice / 100}` : '')
                .replace(/{{我的评分}}/g, bookDetail.myRating || '未评分')
                .replace(/{{书籍分类}}/g, bookDetail.category || '默认分类')
                .replace(/{{阅读状态}}/g, bookDetail.readingStatus || '未读')
                .replace(/{{开始日期}}/g, bookDetail.startDate || '未开始')
                .replace(/{{读完日期}}/g, bookDetail.finishDate || '未完成')
                .replace(/{{封面}}/g, bookDetail.cover || '')
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
            path: sqlresult[0].hpath + "/" + bookDetail.title,
            markdown: ""
        });

        const template = noteTemplate
            .replace(/{{书名}}/g, bookDetail.title || '无书名')
            .replace(/{{副标题}}/g, bookDetail.subtitle || '')
            .replace(/{{原作名}}/g, bookDetail.originalTitle || '')
            .replace(/{{作者}}/g, bookDetail.authors || '')
            .replace(/{{译者}}/g, bookDetail.translators || '')
            .replace(/{{出版社}}/g, bookDetail.copyrightInfo?.name || bookDetail.publisher || '未知出版社')
            .replace(/{{出版年}}/g, bookDetail.publishDate || '未知日期')
            .replace(/{{出品方}}/g, bookDetail.producer || '')
            .replace(/{{ISBN}}/g, bookDetail.isbn || '')
            .replace(/{{装帧}}/g, bookDetail.format || '')
            .replace(/{{丛书}}/g, bookDetail.series || '')
            .replace(/{{页数}}/g, bookDetail.pages ? `${bookDetail.pages}` : '')
            .replace(/{{定价}}/g, bookDetail.centPrice ? `${bookDetail.centPrice / 100}` : '')
            .replace(/{{我的评分}}/g, bookDetail.myRating || '未评分')
            .replace(/{{书籍分类}}/g, bookDetail.category || '默认分类')
            .replace(/{{阅读状态}}/g, bookDetail.readingStatus || '未读')
            .replace(/{{开始日期}}/g, bookDetail.startDate || '未开始')
            .replace(/{{读完日期}}/g, bookDetail.finishDate || '未完成')
            .replace(/{{封面}}/g, bookDetail.cover || '')

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

    return {
        code: 0,
        msg: "书籍添加成功"
    };

}

// ==== 定义属性列类型 ====
function getAttributeType(attributeName: string): string {
    switch (attributeName) {
        case "作者":
        case "译者":
        case "出版社":
        case "装帧":
        case "bookID":
        case "微信读书评分":
            return "text";
        case "ISBN":
        case "微信读书评分人数":
            return "number";
        case "定价":
            return "number";
        case "书籍分类":
            return "select";
        case "出版年":
            return "date";
        case "封面":
            return "mAsset";
    }
}

// ==== 构建添加书籍的属性列值 ====
function buildBlocksValues(databaseKeys: any[], bookDetail: any) {
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
                    content: bookDetail.title || ""
                };
                break;

            case "作者":
                keyValue.text = {
                    content: bookDetail.authors || ""
                };
                break;

            case "译者":
                keyValue.text = {
                    content: bookDetail.translators || ""
                };
                break;

            case "bookID":
                keyValue.text = {
                    content: bookDetail.bookId || ""
                };
                break;

            case "出版社":
                keyValue.text = {
                    content: bookDetail.copyrightInfo.name || bookDetail.publisher || ""
                };
                break;

            case "微信读书评分":
                keyValue.text = {
                    content: bookDetail.newRatingDetail.title || ""
                };
                break;

            case "微信读书评分人数":
                keyValue.number = {
                    content: bookDetail.ratingCount ? Number(bookDetail.ratingCount) : null,
                    formattedContent: bookDetail.ratingCount ? String(bookDetail.ratingCount) : "",
                    isNotEmpty: true
                };
                break;

            case "装帧":
                keyValue.text = {
                    content: bookDetail.format || ""
                };
                break;

            case "ISBN":
                keyValue.number = {
                    content: bookDetail.isbn ? Number(bookDetail.isbn) : null,
                    formattedContent: bookDetail.isbn ? String(bookDetail.isbn) : "",
                    isNotEmpty: true
                };
                break;

            case "定价":
                keyValue.number = {
                    content: bookDetail.centPrice ? Number(bookDetail.centPrice / 100) : null,
                    formattedContent: bookDetail.centPrice ? String(bookDetail.centPrice / 100) : "",
                    isNotEmpty: true
                };
                break;

            case "出版年":
                keyValue.date = {
                    content: bookDetail.publishTime ? parseDateToTimestamp(bookDetail.publishTime) : null,
                    isNotEmpty: !!bookDetail.publishTime,
                    isNotTime: true
                };
                break;

            case "封面":
                if (bookDetail.cover) {
                    keyValue.mAsset = [{
                        content: bookDetail.cover,
                        type: "image"
                    }];
                } else {
                    keyValue.mAsset = [];
                }
                break;

            case "书籍分类":
                keyValue.mSelect = [{
                    content: bookDetail.category || ""
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