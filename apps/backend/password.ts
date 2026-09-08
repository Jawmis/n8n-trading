import { timingSafeEqual } from "node:crypto";

const ARGON2_HASH_PREFIX = "$argon2";

export function isPasswordHash(value: string) {
    return value.startsWith(ARGON2_HASH_PREFIX);
}

export async function hashPassword(password: string) {
    return Bun.password.hash(password, { algorithm: "argon2id" });
}

export async function verifyPassword(password: string, storedValue: string) {
    if (isPasswordHash(storedValue)) {
        return Bun.password.verify(password, storedValue);
    }

    const passwordBytes = Buffer.from(password);
    const storedBytes = Buffer.from(storedValue);
    return passwordBytes.length === storedBytes.length && timingSafeEqual(passwordBytes, storedBytes);
}
