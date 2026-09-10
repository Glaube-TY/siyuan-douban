export interface LocalBookTemplateVariables {
    title: string;
    subtitle: string;
    originalTitle: string;
    author: string;
    translator: string;
    publisher: string;
    publishDate: string;
    producer: string;
    isbn: string;
    binding: string;
    series: string;
    rating: string;
    ratingCount: string;
    pages: string;
    price: string;
    myRating: string;
    category: string;
    readingStatus: string;
    startDate: string;
    finishDate: string;
    cover: string;
    description: string;
    authorBio: string;
}

const LOCAL_BOOK_TEMPLATE_VARIABLES: ReadonlyArray<readonly [keyof LocalBookTemplateVariables, string]> = [
    ["title", "书名"],
    ["subtitle", "副标题"],
    ["originalTitle", "原作名"],
    ["author", "作者"],
    ["translator", "译者"],
    ["publisher", "出版社"],
    ["publishDate", "出版年"],
    ["producer", "出品方"],
    ["isbn", "ISBN"],
    ["binding", "装帧"],
    ["series", "丛书"],
    ["rating", "豆瓣评分"],
    ["ratingCount", "评分人数"],
    ["pages", "页数"],
    ["price", "定价"],
    ["myRating", "我的评分"],
    ["category", "书籍分类"],
    ["readingStatus", "阅读状态"],
    ["startDate", "开始日期"],
    ["finishDate", "读完日期"],
    ["cover", "封面"],
    ["description", "书籍简介"],
    ["authorBio", "作者介绍"],
];

const LOCAL_BOOK_TEMPLATE_VARIABLE_PATTERN = new RegExp(
    `\\{\\{(${LOCAL_BOOK_TEMPLATE_VARIABLES.map(([, name]) => name).join("|")})\\}\\}`,
    "g",
);

export function renderLocalBookTemplateVariables(
    template: string,
    variables: LocalBookTemplateVariables,
): string {
    const valuesByName = new Map(
        LOCAL_BOOK_TEMPLATE_VARIABLES.map(([key, name]) => [name, String(variables[key] ?? "")] as const),
    );

    return template.replace(
        LOCAL_BOOK_TEMPLATE_VARIABLE_PATTERN,
        (_match, name: string) => valuesByName.get(name) ?? "",
    );
}
