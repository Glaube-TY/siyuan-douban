import { parseDateToTimestamp } from '../core/formatOp';
import { sql, getAttributeView, removeAttributeViewBlocks, createDocWithMd } from "@/api";
import { downloadWereadCoverSafely } from './downloadWereadCover';
import { ensureAttributeViewKeys, appendBookToAttributeView } from '../bookHandling/ensureAttributeViewKeys';
import { bindBookToNote } from '../bookHandling/bindBookToNote';
import { findBookByNormalizedTitle } from '../bookHandling/bookDeduplication';
import { findBookPrimaryKeyValue } from '../bookHandling/bookDatabasePrimaryKey';
import { renderBookNoteTemplate } from '../template/renderBookNoteTemplate';
import { renderLocalBookTemplateVariables } from '../template/renderLocalBookTemplateVariables';
import { formatWereadRatingPercent } from './api/formatWereadRating';
import type { WereadApiDatabaseBookDetail } from './api/buildWereadApiDatabaseBookDetail';

// 添加 useBookID 书籍到数据库
export async function addUseBookIDsToDatabase(plugin: any, avID: string, bookDetail: WereadApiDatabaseBookDetail) {
    let getdatabase = await getAttributeView(avID);
    let originalDatabasekeyValues = getdatabase.av.keyValues;

    // 检查数据库是否为空或不存在 bookID 列
    if (originalDatabasekeyValues && Array.isArray(originalDatabasekeyValues)) {
        // 查找 bookID 列
        const bookIDKey = originalDatabasekeyValues.find((kv: any) => kv.key?.name === "bookID");
        const bookNameKey = findBookPrimaryKeyValue(originalDatabasekeyValues);

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
                await removeAttributeViewBlocks(avID, blockIDsToRemove);

                // 重新获取数据库信息
                getdatabase = await getAttributeView(avID);
                originalDatabasekeyValues = getdatabase.av.keyValues;
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

        // 同一本书可能已通过 ISBN 或其他来源导入，但没有当前 bookID。
        if (findBookByNormalizedTitle(originalDatabasekeyValues, bookDetail.title)) {
            return {
                code: 1,
                msg: "书籍已存在（书名匹配），跳过添加操作"
            };
        }
    }

    // 定义书籍属性列
    const requiredBookAttributes = ["封面", "作者", "译者", "出版社", "出版年", "ISBN", "定价", "书籍分类", "书籍简介", "微信读书评分", "微信读书评分人数", "bookID"].reverse();

    // 确保数据库包含所有必需的属性列
    const databaseKeys = await ensureAttributeViewKeys(avID, requiredBookAttributes, getAttributeType);

    // 下载封面
    const originalCover = bookDetail.cover || "";
    const localCover = await downloadWereadCoverSafely(originalCover, bookDetail.title || bookDetail.bookId || "weread_cover");
    bookDetail.cover = localCover || "";

    // 添加书籍数据到数据库并回查 blockID
    const { blockID, matchingValue } = await appendBookToAttributeView(
        avID,
        databaseKeys,
        bookDetail,
        buildBlocksValues
    );

    const setting = await plugin.loadData("settings.json");

    // 创建读书笔记
    const sqlresult = await sql(`SELECT * FROM blocks WHERE id = "${setting.bookDatabaseID}"`);

    // 检查SQL查询结果
    if (!sqlresult || sqlresult.length === 0) {
        throw new Error(`未找到ID为 ${setting.bookDatabaseID} 的数据库块，请确保数据库存在且ID正确`);
    }

    // 先创建空文档，再统一交给思源内部模板渲染。
    const template = renderLocalBookTemplateVariables(setting.noteTemplate, {
        title: bookDetail.title || "",
        subtitle: "",
        originalTitle: "",
        author: bookDetail.author || "",
        translator: "",
        publisher: bookDetail.publisher || "",
        publishDate: bookDetail.publishTime ? String(parseDateToTimestamp(bookDetail.publishTime)) : "",
        producer: "",
        isbn: bookDetail.isbn ? String(bookDetail.isbn) : "",
        binding: "",
        series: "",
        doubanRating: "",
        doubanRatingCount: "",
        pages: "",
        price: "",
        myRating: "",
        bookCategory: "",
        readingStatus: "",
        startDate: "",
        finishDate: "",
        cover: bookDetail.cover || "",
        description: bookDetail.intro || "",
        authorBio: "",
        wereadRating: formatWereadRatingPercent(bookDetail.newRating),
        wereadRatingCount: bookDetail.newRatingCount ? String(bookDetail.newRatingCount) : "",
    });

    await createDocWithMd(
        sqlresult[0].box,
        sqlresult[0].hpath + "/" + bookDetail.title,
        "",
        { id: blockID, parentID: sqlresult[0].root_id }
    );
    await renderBookNoteTemplate(blockID, template);

    // 绑定数据库与读书笔记
    await bindBookToNote(avID, blockID, matchingValue);

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
        case "书籍简介":
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
function buildBlocksValues(databaseKeys: any[], bookDetail: any, _rowID: string) {
    const blockValues = [];

    // 处理每个属性列
    for (const key of databaseKeys) {
        const keyValue: any = {
            keyID: key.id,
            name: key.name
        };

        if (key.type === "block") {
            keyValue.block = {
                content: bookDetail.title || ""
            };
            blockValues.push(keyValue);
            continue;
        }

        switch (key.name) {
            case "作者":
                keyValue.text = {
                    content: bookDetail.author || ""
                };
                break;

            case "译者":
                keyValue.text = {
                    content: ""
                };
                break;

            case "bookID":
                keyValue.text = {
                    content: bookDetail.bookId || ""
                };
                break;

            case "出版社":
                keyValue.text = {
                    content: bookDetail.publisher || ""
                };
                break;

            case "微信读书评分":
                keyValue.text = {
                    content: formatWereadRatingPercent(bookDetail.newRating)
                };
                break;

            case "微信读书评分人数":
                keyValue.number = {
                    content: bookDetail.newRatingCount ? Number(bookDetail.newRatingCount) : null,
                    formattedContent: bookDetail.newRatingCount ? String(bookDetail.newRatingCount) : "",
                    isNotEmpty: !!bookDetail.newRatingCount
                };
                break;

            case "装帧":
                keyValue.text = {
                    content: ""
                };
                break;

            case "书籍简介":
                keyValue.text = {
                    content: bookDetail.intro || ""
                };
                break;

            case "ISBN":
                keyValue.number = {
                    content: bookDetail.isbn ? Number(bookDetail.isbn) : null,
                    formattedContent: bookDetail.isbn ? String(bookDetail.isbn) : "",
                    isNotEmpty: !!bookDetail.isbn
                };
                break;

            case "定价":
                keyValue.number = {
                    content: null,
                    formattedContent: "",
                    isNotEmpty: false
                };
                break;

            case "页数":
                keyValue.number = {
                    content: null,
                    formattedContent: "",
                    isNotEmpty: false
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
                keyValue.mSelect = [];
                break;

            case "豆瓣评分":
            case "评分人数":
                keyValue.number = {
                    content: null,
                    formattedContent: "",
                    isNotEmpty: false
                };
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
