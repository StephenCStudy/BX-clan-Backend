import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import ChatMessage from "../models/ChatMessage.js";

const router = Router();

router.get("/history", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const items = await ChatMessage.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "username avatarUrl");
    res.json(items.reverse());
  } catch (err) {
    next(err);
  }
});

// Get all messages for a custom room
router.get("/customs/:customRoomId", async (req, res, next) => {
  try {
    const messages = await ChatMessage.find({
      customRoom: req.params.customRoomId,
    })
      .populate("user", "username avatarUrl")
      .sort({ createdAt: 1 })
      .limit(100);
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// Post a new message to a custom room
router.post(
  "/customs/:customRoomId",
  requireAuth,
  async (req: any, res, next) => {
    try {
      const { message } = req.body;
      if (!message || !message.trim()) {
        return res.status(400).json({ message: "Message cannot be empty" });
      }
      const newMessage = await ChatMessage.create({
        user: req.user.id,
        customRoom: req.params.customRoomId,
        message: message.trim(),
      });
      const populated = await ChatMessage.findById(newMessage._id).populate(
        "user",
        "username avatarUrl"
      );
      res.json(populated);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
