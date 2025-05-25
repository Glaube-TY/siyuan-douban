export function formatTime() {
    const now = new Date();
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
    ].join('');
}

export function parseDateToTimestamp(dateStr: string): number {
    if (!dateStr) return 0;
    const formats = [
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
        /^(\d{4})-(\d{1,2})$/,
        /^(\d{4})$/,
        /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,
        /^(\d{4})年(\d{1,2})月$/,
        /^(\d{4})年$/
    ];

    let year = 0, month = 0, day = 0;
    for (const regex of formats) {
        const match = dateStr.match(regex);
        if (match) {
            year = parseInt(match[1]);
            month = match[2] ? parseInt(match[2]) - 1 : 0;
            day = match[3] ? parseInt(match[3]) : 1;
            break;
        }
    }
    return year ? new Date(year, month, day).getTime() : 0;
}

export function cleanNumberString(numStr: string): number {
    const cleaned = numStr.replace(/[^\d.]/g, '');
    return parseFloat(cleaned.replace(/\.+$/, '')
        .replace(/^\.+/, '')
        .replace(/\.(?=.*\.)/g, '')) || 0;
}

export function generateRandomId(length = 7) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    return Array.from({ length }, () => 
        chars[Math.floor(Math.random() * chars.length)]
    ).join('');
}

export function generateUniqueBlocked() {
    return `${formatTime()}-${generateRandomId()}`;
}