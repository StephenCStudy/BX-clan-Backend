import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import PrivateMessage from "../models/PrivateMessage.js";

const router = Router();

// Get all unread private messages for current user
router.get("/unread", requireAuth, async (req: any, res, next) => {
  try {
    const userId = req.user.id;
    const unreadMessages = await PrivateMessage.find({
      to: userId,
      isRead: false,
    })
      .populate("from", "username avatarUrl role")
      .populate("to", "username avatarUrl role")
      .sort({ createdAt: -1 })
      .limit(10);

    res.json(unreadMessages);
  } catch (err) {
    next(err);
  }
});

// Get conversation with a specific user
router.get(
  "/conversation/:userId",
  requireAuth,
  async (req: any, res, next) => {
    try {
      const { userId } = req.params;
      const currentUserId = req.user.id;

      // Get all messages between these two users
      const messages = await PrivateMessage.find({
        $or: [
          { from: currentUserId, to: userId },
          { from: userId, to: currentUserId },
        ],
      })
        .populate("from", "username avatarUrl role")
        .populate("to", "username avatarUrl role")
        .sort({ createdAt: 1 })
        .limit(100);

      // Mark messages as read (messages sent TO current user FROM the other user)
      await PrivateMessage.updateMany(
        { from: userId, to: currentUserId, isRead: false },
        { isRead: true }
      );

      res.json(messages);
    } catch (err) {
      next(err);
    }
  }
);

// Get unread count from a specific user
router.get("/unread/:userId", requireAuth, async (req: any, res, next) => {
  try {
    const count = await PrivateMessage.countDocuments({
      from: req.params.userId,
      to: req.user.id,
      isRead: false,
    });
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

// Get all conversations (users who have messaged current user or vice versa)
router.get("/conversations", requireAuth, async (req: any, res, next) => {
  try {
    const userId = req.user.id;

    // Get unique user IDs from conversations
    const messages = await PrivateMessage.find({
      $or: [{ from: userId }, { to: userId }],
    })
      .populate("from", "username avatarUrl role")
      .populate("to", "username avatarUrl role")
      .sort({ createdAt: -1 });

    // Group by conversation partner
    const conversationsMap = new Map();
    for (const msg of messages) {
      const partnerId =
        msg.from._id.toString() === userId
          ? msg.to._id.toString()
          : msg.from._id.toString();

      if (!conversationsMap.has(partnerId)) {
        const partner = msg.from._id.toString() === userId ? msg.to : msg.from;
        const unreadCount = await PrivateMessage.countDocuments({
          from: partnerId,
          to: userId,
          isRead: false,
        });

        conversationsMap.set(partnerId, {
          user: partner,
          lastMessage: msg.message,
          lastMessageAt: msg.createdAt,
          unreadCount,
        });
      }
    }

    const conversations = Array.from(conversationsMap.values());
    res.json(conversations);
  } catch (err) {
    next(err);
  }
});

// Send a private message
router.post("/send", requireAuth, async (req: any, res, next) => {
  try {
    const { to, message } = req.body;
    const from = req.user.id;

    if (!to || !message) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const privateMessage = await PrivateMessage.create({
      from,
      to,
      message,
    });

    const populated = await PrivateMessage.findById(privateMessage._id)
      .populate("from", "username avatarUrl role")
      .populate("to", "username avatarUrl role");

    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
});

export default router;
