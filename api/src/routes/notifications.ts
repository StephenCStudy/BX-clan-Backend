import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import Notification from "../models/Notification.js";

const router = Router();

// Get user's notifications
router.get("/", requireAuth, async (req: any, res, next) => {
  try {
    const items = await Notification.find({ user: req.user.id })
      .populate("relatedNews", "title")
      .populate("relatedRoom", "roomNumber")
      .sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// Mark notification as read
router.put("/:id/read", requireAuth, async (req: any, res, next) => {
  try {
    const item = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { isRead: true },
      { new: true }
    );
    res.json(item);
  } catch (err) {
    next(err);
  }
});

// Mark all as read
router.put("/read-all", requireAuth, async (req: any, res, next) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, isRead: false },
      { isRead: true }
    );
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
});

// Delete notification
router.delete("/:id", requireAuth, async (req: any, res, next) => {
  try {
    await Notification.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    });
    res.json({ message: "Notification deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
