import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Clan from "../models/Clan.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/register", async (req, res, next) => {
  try {
    const { username, ingameName, password } = req.body;
    if (!username || !ingameName || !password)
      return res.status(400).json({ message: "Missing fields" });
    const exists = await User.findOne({ username });
    if (exists)
      return res.status(409).json({ message: "Username already taken" });
    // Ensure a default clan exists (single clan setup)
    let clan = await Clan.findOne();
    if (!clan)
      clan = await Clan.create({
        clanName: "BX Clan",
        description: "Wild Rift Clan",
      });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      password: hashedPassword,
      ingameName,
      clan: clan._id,
      avatarUrl:
        "https://res.cloudinary.com/dhlsylij1/image/upload/v1763431528/OIP_qg8ut8.webp",
    });
    const token = jwt.sign(
      { id: String(user._id), role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: process.env.JWT_EXPIRE || "7d" } as any
    );
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        ingameName: user.ingameName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: "Missing fields" });
    const user = await User.findOne({ username });
    if (!user)
      return res
        .status(404)
        .json({ message: "Tên đăng nhập không tồn tại" });
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid)
      return res.status(400).json({ message: "Mật khẩu không đúng" });
    const token = jwt.sign(
      { id: String(user._id), role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: process.env.JWT_EXPIRE || "7d" } as any
    );
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        ingameName: user.ingameName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const { ingameName } = req.body;
    if (!ingameName)
      return res.status(400).json({ message: "Missing ingameName" });
    // Search case-insensitive and trim whitespace
    const user = await User.findOne({
      ingameName: { $regex: new RegExp(`^${ingameName.trim()}$`, "i") },
    });
    if (!user)
      return res.status(404).json({ message: "Ingame name not found" });

    // Generate a new random password
    const newPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    user.password = hashedPassword;
    await user.save();

    res.json({
      username: user.username,
      ingameName: user.ingameName,
      password: newPassword,
      message: "Password has been reset",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req: any, res, next) => {
  try {
    const user = await User.findById(req.user.id).select(
      "username ingameName role avatarUrl clan rank lane"
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.put("/me", requireAuth, async (req: any, res, next) => {
  try {
    const { ingameName, rank, lane } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { ingameName, rank, lane },
      { new: true }
    ).select("username ingameName role avatarUrl clan rank lane");
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.put("/me/avatar", requireAuth, async (req: any, res, next) => {
  try {
    const { avatarUrl } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatarUrl },
      { new: true }
    ).select("username ingameName role avatarUrl clan rank lane");
    res.json(user);
  } catch (err) {
    next(err);
  }
});

export default router;
