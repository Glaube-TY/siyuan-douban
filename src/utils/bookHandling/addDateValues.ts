import { generateUniqueBlocked, parseDateToTimestamp } from '../core/formatOp';

export async function addDateColumn(jsonData: any, columnName: string, dateStr: string, uniqueBlockId: string) {
    if (!dateStr) return jsonData;

    // 查找或创建列定义
    let column = jsonData.keyValues.find(item => item.key.name === columnName);
    if (!column) {
        const newKey = {
            key: {
                id: generateUniqueBlocked(),
                name: columnName,
                type: "date",
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
    const timestamp = parseDateToTimestamp(dateStr) || Date.now();
    const newItem = {
        id: generateUniqueBlocked(),
        keyID: targetColumn.key.id,
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
    };

    targetColumn.values.push(newItem);
    return jsonData;
}