import { generateUniqueBlocked } from '../characterOp/formatOp';

export async function addSelectColumn(jsonData: any, columnName: string, selectedValue: string, uniqueBlockId: string) {
    // 查找或创建列定义
    let column = jsonData.keyValues.find(item => item.key.name === columnName);
    if (!column) {
        const newKey = {
            key: {
                id: generateUniqueBlocked(),
                name: columnName,
                type: "select",
                icon: "",
                desc: "",
                options: [],
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

    // 添加选项
    const targetColumn = jsonData.keyValues.find(item => item.key.name === columnName);
    const existingOption = targetColumn.key.options.find(opt => opt.name === selectedValue);
    if (!existingOption) {
        targetColumn.key.options.push({
            name: selectedValue,
            color: "", // 默认无颜色
            desc: ""
        });
    }

    // 初始化values数组
    if (!targetColumn.values) {
        targetColumn.values = [];
    }

    // 创建新数据项
    const newItem = {
        id: generateUniqueBlocked(),
        keyID: targetColumn.key.id,
        blockID: uniqueBlockId,
        type: "select",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        mSelect: [{
            content: selectedValue,
            color: existingOption?.color || targetColumn.key.options.find(opt => opt.name === selectedValue)?.color || ""
        }]
    };

    targetColumn.values.push(newItem);
    return jsonData;
}