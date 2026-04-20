import { logError } from "../core/logger";

export async function updateEndBlocks(plugin: any, blockID: string, wereadPositionMark: string, noteContent: any) {
    // 检查 blockID 是否存在
    if (!blockID) {
        throw new Error("blockID 不存在");
    }

    try {
        const childBlocks = await plugin.client.getChildBlocks({
            id: blockID,
        });

        // 检查是否有子块（空文档场景也兼容，视为首次写入）
        const data = childBlocks?.data || [];
        const targetContent = wereadPositionMark;

        let targetBlock = data.find((block: { content: string; }) => block.content === targetContent);
        let targetBlockID: string | null = null;
        let idsList: string[] = [];

        if (targetBlock) {
            targetBlockID = targetBlock.id;
            const targetIndex = data.indexOf(targetBlock);
            // 记录标记块之后的所有旧块 ID，用于后续删除
            idsList = data.slice(targetIndex + 1).map(block => block.id);
        } else {
            // 如果没有找到标记块，则在文档末尾添加标记块
            // 空文档场景：data 为空，previousID 直接用 blockID（文档自身）
            const lastBlock = data.length > 0 ? data[data.length - 1] : null;
            const markBlockID = await plugin.client.insertBlock({
                data: targetContent,
                dataType: "markdown",
                previousID: lastBlock ? lastBlock.id : blockID,
            });

            // 使用新插入的标记块作为目标块
            targetBlockID = markBlockID.data[0].doOperations[0].id;
        }

        // 【关键改动】先插入新内容，成功后再删除旧内容
        // 这样即使插入失败，旧内容仍然保留
        const newBlockResult = await plugin.client.insertBlock({
            data: noteContent,
            dataType: "markdown",
            previousID: targetBlockID,
        });

        // 获取新插入块的 ID
        const newBlockID = newBlockResult.data[0].doOperations[0].id;

        // 新内容插入成功后，再删除旧内容
        // 删除时跳过刚插入的新块（以防万一新块也在 idsList 中）
        for (const id of idsList) {
            // 确保不删除刚插入的新块
            if (id === newBlockID) {
                continue;
            }
            try {
                await plugin.client.deleteBlock({ id });
            } catch (error) {
                logError("weread/updateWereadBlocks", `删除块 ${id} 时出错`, error);
            }
        }
    } catch (error) {
        logError("weread/updateWereadBlocks", `获取子块或更新块时出错，blockID: ${blockID}`, error);
        // 重新抛出错误，以便在调用函数中处理
        throw error;
    }
}