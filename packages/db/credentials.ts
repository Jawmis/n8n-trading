import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function encryptionKey() {
    const encoded = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!encoded) throw new Error("CREDENTIAL_ENCRYPTION_KEY is required");
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    return key;
}

export function encryptCredential(value: Record<string, unknown>) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return {
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
    };
}

export function decryptCredential(input: { ciphertext: string; iv: string; authTag: string }): Record<string, unknown> {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(input.iv, "base64"));
    decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(input.ciphertext, "base64")),
        decipher.final(),
    ]).toString("utf8");
    const parsed: unknown = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Stored credential is invalid");
    return parsed as Record<string, unknown>;
}
