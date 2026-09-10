export function parsePagination(pageValue: unknown, pageSizeValue: unknown) {
    const page = parsePositiveInteger(pageValue ?? "1");
    const requestedPageSize = parsePositiveInteger(pageSizeValue ?? "25");
    if (!page || !requestedPageSize) return null;
    return { page, pageSize: Math.min(100, requestedPageSize) };
}

function parsePositiveInteger(value: unknown) {
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
