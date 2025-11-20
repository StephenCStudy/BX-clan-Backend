import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import User from "../models/User.js";
import Invitation from "../models/Invitation.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const members = await User.find()
      .select("username ingameName role avatarUrl joinDate rank lane")
      .sort({ joinDate: -1 });
    res.json(members);
  } catch (err) {
    next(err);
  }
});

router.post("/invite", requireAuth, async (req: any, res, next) => {
  try {
    const { inviteeName, inviteeContact } = req.body;
    const inv = await Invitation.create({
      inviter: req.user.id,
      inviteeName,
      inviteeContact,
    });
    res.json(inv);
  } catch (err) {
    next(err);
  }
});

router.put(
  "/:id/role",
  requireAuth,
  requireRoles("leader", "organizer", "moderator"),
  async (req, res, next) => {
    try {
      const { role } = req.body;
      if (!["leader", "organizer", "moderator", "member"].includes(role))
        return res.status(400).json({ message: "Invalid role" });
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { role },
        { new: true }
      );
      res.json(user);
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  "/:id",
  requireAuth,
  requireRoles("leader", "organizer", "moderator"),
  async (req, res, next) => {
    try {
      await User.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
