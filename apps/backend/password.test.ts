import { describe, expect, test } from "bun:test";
import { hashPassword, isPasswordHash, verifyPassword } from "./password";

describe("password handling", () => {
    test("hashes and verifies passwords without retaining plaintext", async () => {
        const hash = await hashPassword("correct horse battery staple");

        expect(isPasswordHash(hash)).toBe(true);
        expect(hash).not.toBe("correct horse battery staple");
        expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
        expect(await verifyPassword("wrong password", hash)).toBe(false);
    });

    test("supports one-time verification of legacy plaintext records", async () => {
        expect(await verifyPassword("legacy-password", "legacy-password")).toBe(true);
        expect(await verifyPassword("wrong-password", "legacy-password")).toBe(false);
    });
});
