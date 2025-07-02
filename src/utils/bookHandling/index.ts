import { fetchSyncPost } from "siyuan";
import { sql, setBlockAttrs } from "../../api";
import { addTitleBlock } from './addBlockValues';
import { generateUniqueBlocked } from '../core/formatOp';
import { addTextColumn } from './addTextValues';
import { downloadCover, addCover } from './addmAssetValues';
import { addDateColumn } from './addDateValues';
import { addNumberColumn } from './addNumberValues';
import { addSelectColumn } from './addSelectValues';

export async function loadAVData(avID: string, fullData: any) {
    const fs = require('fs');
    const workspacePath = window.siyuan.config.system.workspaceDir;

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
            fullData.cover = await downloadCover(fullData.cover, fullData.title, workspacePath);
            const sqlresult = await sql(`SELECT * FROM blocks WHERE id = "${fullData.databaseBlockId}"`);
            const notebookId = sqlresult[0].box;
            const docPath = sqlresult[0].hpath + "/";
            const response = await fetchSyncPost('/api/filetree/createDocWithMd', {
                notebook: notebookId,
                path: docPath,
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
                    .replace(/{{评分人数}}/g, fullData.ratingCount ? `${fullData.ratingCount}` : '暂无评价')
                    .replace(/{{页数}}/g, fullData.pages ? `${fullData.pages}` : '')
                    .replace(/{{定价}}/g, fullData.price ? `${fullData.price}` : '')
                    .replace(/{{我的评分}}/g, fullData.myRating || '未评分')
                    .replace(/{{书籍分类}}/g, fullData.bookCategory || '默认分类')
                    .replace(/{{阅读状态}}/g, fullData.readingStatus || '未读')
                    .replace(/{{开始日期}}/g, fullData.startDate || '未开始')
                    .replace(/{{读完日期}}/g, fullData.finishDate || '未完成')
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
            fullData.cover = await downloadCover(fullData.cover, fullData.title, workspacePath);
            uniqueBlockId = generateUniqueBlocked();
        }

        // 将书籍ID添加到rowIds数组
        if (!jsonData.views[0].table.rowIds) {
            jsonData.views[0].table.rowIds = []; // 初始化数组
        }
        jsonData.views[0].table.rowIds.push(uniqueBlockId);

        // 执行书籍元数据添加函数
        await addTitleBlock(jsonData, uniqueBlockId, isDetached, fullData);
        await addTextColumn(jsonData, "副标题", fullData.subtitle, uniqueBlockId);
        await addTextColumn(jsonData, "作者", Array.isArray(fullData.authors) ? fullData.authors.join(', ') : '', uniqueBlockId);
        await addTextColumn(jsonData, "原作名", fullData.originalTitle, uniqueBlockId);
        await addCover(jsonData, uniqueBlockId, fullData.cover);
        await addTextColumn(jsonData, "译者", Array.isArray(fullData.translators) ? fullData.translators.join(', ') : '', uniqueBlockId);
        await addTextColumn(jsonData, "出版社", fullData.publisher, uniqueBlockId);
        await addDateColumn(jsonData, "出版年", fullData.publishDate, uniqueBlockId);
        await addTextColumn(jsonData, "出品方", fullData.producer, uniqueBlockId);
        await addTextColumn(jsonData, "丛书", fullData.series, uniqueBlockId);
        await addNumberColumn(jsonData, "ISBN", fullData.ISBN, uniqueBlockId);
        await addNumberColumn(jsonData, "豆瓣评分", fullData.rating, uniqueBlockId);
        await addNumberColumn(jsonData, "评分人数", fullData.ratingCount, uniqueBlockId);
        await addNumberColumn(jsonData, "定价", fullData.price, uniqueBlockId);
        await addNumberColumn(jsonData, "页数", fullData.pages, uniqueBlockId);
        await addTextColumn(jsonData, "装帧", fullData.binding, uniqueBlockId);
        await addSelectColumn(jsonData, "我的评分", fullData.myRating, uniqueBlockId);
        await addSelectColumn(jsonData, "书籍分类", fullData.bookCategory, uniqueBlockId);
        await addSelectColumn(jsonData, "阅读状态", fullData.readingStatus, uniqueBlockId);
        await addDateColumn(jsonData, "开始日期", fullData.startDate, uniqueBlockId);
        await addDateColumn(jsonData, "读完日期", fullData.finishDate, uniqueBlockId);

        fs.writeFileSync(fullPath, JSON.stringify(jsonData, null, 2), 'utf-8');
    } catch (error) {
        return {
            code: 1,
            msg: error.message || "未知错误",
            stack: error.stack
        };
    }
}
