import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import Stream from "../models/Stream.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const items = await Stream.find().sort({ scheduleTime: 1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/",
  requireAuth,
  requireRoles("organizer", "leader"),
  async (req, res, next) => {
    try {
      const item = await Stream.create(req.body);
      res.json(item);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
