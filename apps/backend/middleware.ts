import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { UserModel } from 'db/client';

const JWT_ISSUER = "n8n-trading-api";
const JWT_AUDIENCE = "n8n-trading-client";

export function verifyAccessToken(token: string, secret = process.env.JWT_SECRET): JwtPayload {
    if (!secret) {
        throw new Error("Authentication is not configured");
    }
    const response = jwt.verify(token, secret, {
        algorithms: ["HS256"],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
    });
    if (typeof response === "string"
        || typeof response.id !== "string"
        || typeof response.tokenVersion !== "number") {
        throw new Error("Invalid authentication token");
    }
    return response;
}

export async function authMiddleware(req: Request, res : Response, next: NextFunction) {
    if (!process.env.JWT_SECRET) {
        res.status(500).json({ message: "Authentication is not configured" });
        return;
    }
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (!token) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }
    try {
        const response = verifyAccessToken(token);
        const user = await UserModel.findById(response.id).select("tokenVersion").lean();
        if (!user || user.tokenVersion !== response.tokenVersion) {
            res.status(401).json({ message: "Invalid or revoked authentication token" });
            return;
        }
        req.userId = response.id;
        next();
    } catch {
        res.status(401).json({
            message : "Invalid or expired authentication token"
        })
    }
}

export { JWT_AUDIENCE, JWT_ISSUER };
