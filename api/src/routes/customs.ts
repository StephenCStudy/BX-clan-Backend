import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import CustomRoom from "../models/CustomRoom.js";
import Notification from "../models/Notification.js";
import CustomInvite from "../models/CustomInvite.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 7;
    const search = (req.query.search as string) || "";
    const status = req.query.status as string;
    const skip = (page - 1) * limit;

    const query: any = search
      ? { title: { $regex: search, $options: "i" } }
      : {};

    // Add status filter if provided and not "all"
    if (status && status !== "all") {
      query.status = status;
    }

    const total = await CustomRoom.countDocuments(query);
    const items = await CustomRoom.find(query)
      .populate("players", "username ingameName avatarUrl")
      .populate("team1", "username ingameName avatarUrl")
      .populate("team2", "username ingameName avatarUrl")
      .populate("createdBy", "username")
      .sort({ scheduleTime: -1 })
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
      const {
        title,
        description,
        scheduleTime,
        maxPlayers,
        status,
        players,
      } = req.body;

      const sanitizedPlayers = Array.isArray(players)
        ? players.slice(0, 10)
        : [];
      const team1 = sanitizedPlayers.slice(0, 5);
      const team2 = sanitizedPlayers.slice(5, 10);

      const item = await CustomRoom.create({
        title,
        description,
        scheduleTime,
        maxPlayers: maxPlayers || 10,
        status: status || "open",
        players: sanitizedPlayers,
        team1,
        team2,
        createdBy: req.user.id,
      });
      res.json(item);
    } catch (err) {
      next(err);
    }
  }
);

router.get("/:id", async (req, res, next) => {
  try {
    const item = await CustomRoom.findById(req.params.id)
      .populate("players", "username ingameName avatarUrl")
      .populate("team1", "username ingameName avatarUrl")
      .populate("team2", "username ingameName avatarUrl")
      .populate("createdBy", "username");
    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.put(
  "/:id",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req, res, next) => {
    try {
      const item = await CustomRoom.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
      });
      res.json(item);
    } catch (err) {
      next(err);
    }
  }
);

// Invite a user to custom room
router.post("/:id/invite", requireAuth, async (req: any, res, next) => {
  try {
    const { userId } = req.body;
    const customRoom = await CustomRoom.findById(req.params.id);

    if (!customRoom) {
      return res.status(404).json({ message: "Custom room not found" });
    }

    // Check if user already in room
    const allPlayers = [
      ...(customRoom.team1 || []),
      ...(customRoom.team2 || []),
      ...(customRoom.players || []),
    ];
    if (allPlayers.some((p: any) => p.toString() === userId)) {
      return res.status(400).json({ message: "User already in room" });
    }

    // Check if invite already exists
    const existingInvite = await CustomInvite.findOne({
      customRoom: customRoom._id,
      user: userId,
      status: "pending",
    });

    if (existingInvite) {
      return res.status(400).json({ message: "Invite already sent" });
    }

    // Create invite record
    await CustomInvite.create({
      customRoom: customRoom._id,
      user: userId,
      invitedBy: req.user.id,
      status: "pending",
    });

    // Create notification
    await Notification.create({
      user: userId,
      type: "custom-invite",
      title: `Lời mời tham gia Custom`,
      message: `Bạn được mời tham gia phòng "${customRoom.title}". Vào trang Custom để chấp nhận.`,
      relatedCustomRoom: customRoom._id,
    });

    res.json({ success: true, message: "Invitation sent" });
  } catch (err) {
    next(err);
  }
});

// Get pending invites for a custom room (admin only)
router.get(
  "/:id/invites",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req, res, next) => {
    try {
      const invites = await CustomInvite.find({
        customRoom: req.params.id,
        status: "pending",
      })
        .populate("user", "username ingameName avatarUrl")
        .populate("invitedBy", "username");
      res.json(invites);
    } catch (err) {
      next(err);
    }
  }
);

// Approve invite (admin only)
router.post(
  "/:id/invites/:inviteId/approve",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req, res, next) => {
    try {
      const invite = await CustomInvite.findById(req.params.inviteId);
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }

      const customRoom = await CustomRoom.findById(req.params.id);
      if (!customRoom) {
        return res.status(404).json({ message: "Custom room not found" });
      }

      // Check room capacity
      const totalPlayers =
        (customRoom.team1?.length || 0) + (customRoom.team2?.length || 0);
      if (totalPlayers >= 10) {
        return res.status(400).json({ message: "Room is full" });
      }

      // Add user to room (assign to team with fewer players)
      const team1Count = customRoom.team1?.length || 0;
      const team2Count = customRoom.team2?.length || 0;

      if (team1Count <= team2Count && team1Count < 5) {
        customRoom.team1 = [...(customRoom.team1 || []), invite.user];
      } else if (team2Count < 5) {
        customRoom.team2 = [...(customRoom.team2 || []), invite.user];
      } else {
        return res.status(400).json({ message: "Both teams are full" });
      }

      if (!customRoom.players?.includes(invite.user)) {
        customRoom.players = [...(customRoom.players || []), invite.user];
      }

      await customRoom.save();

      // Update invite status
      invite.status = "approved";
      await invite.save();

      // Notify user
      await Notification.create({
        user: invite.user,
        type: "custom-invite",
        title: "Lời mời được chấp nhận",
        message: `Bạn đã được chấp nhận vào phòng "${customRoom.title}"!`,
        relatedCustomRoom: customRoom._id,
      });

      res.json({ success: true, message: "Invite approved" });
    } catch (err) {
      next(err);
    }
  }
);

// Reject invite (admin only)
router.post(
  "/:id/invites/:inviteId/reject",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req, res, next) => {
    try {
      const invite = await CustomInvite.findByIdAndUpdate(
        req.params.inviteId,
        { status: "rejected" },
        { new: true }
      );
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }
      res.json({ success: true, message: "Invite rejected" });
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
      await CustomRoom.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

// Remove member from custom room
router.delete(
  "/:id/members/:memberId",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req, res, next) => {
    try {
      const { id, memberId } = req.params;
      const customRoom = await CustomRoom.findById(id);

      if (!customRoom) {
        return res.status(404).json({ message: "Custom room not found" });
      }

      // Remove from team1, team2, and players arrays
      customRoom.team1 = (customRoom.team1 || []).filter(
        (p: any) => p.toString() !== memberId
      );
      customRoom.team2 = (customRoom.team2 || []).filter(
        (p: any) => p.toString() !== memberId
      );
      customRoom.players = (customRoom.players || []).filter(
        (p: any) => p.toString() !== memberId
      );

      await customRoom.save();

      // Send notification to removed member
      await Notification.create({
        user: memberId,
        type: "general",
        title: "Đã bị xóa khỏi phòng",
        message: `Bạn đã bị xóa khỏi phòng "${customRoom.title}"`,
        relatedCustomRoom: id,
      });

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
