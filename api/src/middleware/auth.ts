import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export interface AuthedRequest extends Request {
  user?: { id: string; role: string };
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.split(" ")[1]
    : undefined;
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: string;
      role: string;
    };
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export function requireRoles(...roles: string[]) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const me = await User.findById(req.user.id);
    if (!me) return res.status(401).json({ message: "Unauthorized" });
    if (!roles.includes(me.role))
      return res.status(403).json({ message: "Forbidden" });
    next();
  };
}
