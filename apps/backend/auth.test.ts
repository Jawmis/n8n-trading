import jwt from "jsonwebtoken";
import { describe, expect, test } from "bun:test";
import { JWT_AUDIENCE, JWT_ISSUER, verifyAccessToken } from "./middleware";

const secret = "auth-test-secret";
const claims = { id: "507f1f77bcf86cd799439011", tokenVersion: 0 };

function sign(overrides: Record<string, unknown> = {}) {
    return jwt.sign({ ...claims, ...overrides }, secret, {
        algorithm: "HS256",
        expiresIn: "1h",
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
    });
}

describe("access token validation", () => {
    test("accepts the API token contract", () => {
        expect(verifyAccessToken(sign(), secret)).toMatchObject(claims);
    });

    test("rejects missing required claims", () => {
        expect(() => verifyAccessToken(sign({ tokenVersion: undefined }), secret)).toThrow();
        expect(() => verifyAccessToken(sign({ id: undefined }), secret)).toThrow();
    });

    test("rejects a wrong issuer or audience", () => {
        const wrongIssuer = jwt.sign(claims, secret, { algorithm: "HS256", issuer: "other", audience: JWT_AUDIENCE });
        const wrongAudience = jwt.sign(claims, secret, { algorithm: "HS256", issuer: JWT_ISSUER, audience: "other" });
        expect(() => verifyAccessToken(wrongIssuer, secret)).toThrow();
        expect(() => verifyAccessToken(wrongAudience, secret)).toThrow();
    });

    test("rejects expired and non-HS256 tokens", () => {
        const expired = jwt.sign(claims, secret, { algorithm: "HS256", expiresIn: -1, issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
        const asymmetric = jwt.sign(claims, secret, { algorithm: "HS384", issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
        expect(() => verifyAccessToken(expired, secret)).toThrow();
        expect(() => verifyAccessToken(asymmetric, secret)).toThrow();
    });
});
