import { generateUniqueBlocked } from '../core/formatOp';

export function addTextColumn(jsonData: any, columnName: string, value: string, uniqueBlockId: string) {
    // 查找或创建列定义
    let column = jsonData.keyValues.find(item => item.key.name === columnName);
    if (!column) {
        const newKey = {
            key: {
                id: generateUniqueBlocked(),
                name: columnName,
                type: "text",
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
            width: ""
        });
    }

    // 初始化values数组
    const targetColumn = jsonData.keyValues.find(item => item.key.name === columnName);
    if (!targetColumn.values) {
        targetColumn.values = [];
    }

    // 创建新数据项
    const newItem = {
        id: generateUniqueBlocked(),
        keyID: targetColumn.key.id,
        blockID: uniqueBlockId,
        type: "text",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        text: { content: value || '' }
    };

    targetColumn.values.push(newItem);
    return jsonData;
}