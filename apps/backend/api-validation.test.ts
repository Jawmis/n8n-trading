import { describe, expect, test } from "bun:test";
import { parsePagination } from "./api-validation";

describe("pagination validation", () => {
    test("uses safe defaults and caps page size", () => {
        expect(parsePagination(undefined, undefined)).toEqual({ page: 1, pageSize: 25 });
        expect(parsePagination("2", "500")).toEqual({ page: 2, pageSize: 100 });
    });

    test("rejects malformed values instead of silently defaulting", () => {
        expect(parsePagination("0", "25")).toBeNull();
        expect(parsePagination("1.5", "25")).toBeNull();
        expect(parsePagination("1", "nope")).toBeNull();
    });
});
