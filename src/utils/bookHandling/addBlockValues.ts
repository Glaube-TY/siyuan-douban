import { generateUniqueBlocked } from '../core/formatOp';

export function addTitleBlock(jsonData: any, uniqueBlockId: string, isDetached: boolean, fullData: any) {
    const mainKey = jsonData.keyValues.find(item => item.key.type === "block");
    
    // 确保主键列名是"书名"
    if (mainKey.key.name !== "书名") {
        mainKey.key.name = "书名";
    }

    if (!mainKey.values) {
        mainKey.values = [];
    }

    const newBookTitle = {
        id: generateUniqueBlocked(),
        keyID: mainKey.key.id,
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
    
    mainKey.values.push(newBookTitle);
    return jsonData;
}