import { fetchSyncPost } from "siyuan";
import { setBlockAttrs } from "@/api";

/**
 * 绑定数据库书籍与读书笔记文档
 * @param avID 数据库 ID
 * @param blockID 文档 blockID
 * @param matchingValue 匹配到的数据库行数据
 */
export async function bindBookToNote(
    avID: string,
    blockID: string,
    matchingValue: any
): Promise<void> {
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
    });
}