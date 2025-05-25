import { generateUniqueBlocked, cleanNumberString } from '../core/formatOp';

export async function addNumberColumn(jsonData: any, columnName: string, value: string, uniqueBlockId: string) {
    // 处理空值情况
    if (!value) {
        value = "0"; // 设置默认值
    }

    // 查找或创建列定义
    let column = jsonData.keyValues.find(item => item.key.name === columnName);
    if (!column) {
        const newKey = {
            key: {
                id: generateUniqueBlocked(),
                name: columnName,
                type: "number",
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
        type: "number",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        number: {
            content: cleanNumberString(value),
            isNotEmpty: true,
            format: "",
            formattedContent: value || "0"
        }
    };

    targetColumn.values.push(newItem);
    return jsonData;
}