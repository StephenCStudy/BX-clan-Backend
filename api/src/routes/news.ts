import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import News from "../models/News.js";
import Comment from "../models/Comment.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 7;
    const search = (req.query.search as string) || "";
    const skip = (page - 1) * limit;

    const query = search ? { title: { $regex: search, $options: "i" } } : {};

    const total = await News.countDocuments(query);
    const items = await News.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ items, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req: any, res, next) => {
    try {
      const { title, content, type } = req.body;
      const item = await News.create({
        title,
        content,
        type: type || "announcement",
        createdBy: req.user.id,
      });
      res.json(item);
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  "/:id",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req: any, res, next) => {
    try {
      const { title, content, type } = req.body;
      const item = await News.findByIdAndUpdate(
        req.params.id,
        { title, content, type },
        { new: true }
      );
      res.json(item);
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  "/:id",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req, res, next) => {
    try {
      await News.findByIdAndDelete(req.params.id);
      res.json({ message: "Deleted" });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /news/for-room-creation
 * Lấy danh sách news có type="room-creation" (dùng để tạo phòng giải đấu)
 */
router.get("/for-room-creation", async (req, res, next) => {
  try {
    const items = await News.find({ type: "room-creation" })
      .populate("createdBy", "username")
      .populate("tournament")
      .sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const item = await News.findById(req.params.id)
      .populate("createdBy", "username")
      .populate("tournament");
    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.get("/:id/comments", async (req, res, next) => {
  try {
    const items = await Comment.find({ news: req.params.id })
      .sort({ createdAt: 1 })
      .populate("user", "username avatarUrl");
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/comments", requireAuth, async (req: any, res, next) => {
  try {
    const item = await Comment.create({
      news: req.params.id,
      user: req.user.id,
      message: req.body.message,
    });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

export default router;
