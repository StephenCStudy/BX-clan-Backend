import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import Report from "../models/Report.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requireRoles("moderator", "organizer", "leader"),
  async (_req, res, next) => {
    try {
      const items = await Report.find().sort({ createdAt: -1 });
      res.json(items);
    } catch (err) {
      next(err);
    }
  }
);

router.post("/", requireAuth, async (req: any, res, next) => {
  try {
    const { targetId, content } = req.body;
    const item = await Report.create({
      reporter: req.user.id,
      target: targetId,
      content,
    });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.put(
  "/:id",
  requireAuth,
  requireRoles("moderator", "organizer", "leader"),
  async (req: any, res, next) => {
    try {
      const { status } = req.body;
      const item = await Report.findByIdAndUpdate(
        req.params.id,
        { status, reviewedBy: req.user.id },
        { new: true }
      );
      res.json(item);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
