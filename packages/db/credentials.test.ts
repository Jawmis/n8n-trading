import { beforeEach, describe, expect, test } from "bun:test";
import { decryptCredential, encryptCredential } from "./credentials";

beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("credential encryption", () => {
    test("round trips secrets without storing plaintext", () => {
        const secret = { apiKey: "super-secret", accountIndex: 1 };
        const encrypted = encryptCredential(secret);
        expect(encrypted.ciphertext).not.toContain(secret.apiKey);
        expect(decryptCredential(encrypted)).toEqual(secret);
    });

    test("fails closed when ciphertext is modified", () => {
        const encrypted = encryptCredential({ apiKey: "super-secret" });
        const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
        ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
        expect(() => decryptCredential({ ...encrypted, ciphertext: ciphertext.toString("base64") })).toThrow();
    });
});
