import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import Registration from "../models/Registration.js";
import GameRoom from "../models/GameRoom.js";
import Notification from "../models/Notification.js";
import News from "../models/News.js";
import CustomRoom from "../models/CustomRoom.js";

const router = Router();

// Get user's own registrations
router.get("/my", requireAuth, async (req: any, res, next) => {
  try {
    const registrations = await Registration.find({
      user: req.user.id,
    })
      .populate("news", "_id title type")
      .populate("room");
    res.json(registrations);
  } catch (err) {
    next(err);
  }
});

// Register for a news post (room-creation type)
router.post(
  "/news/:newsId/register",
  requireAuth,
  async (req: any, res, next) => {
    try {
      const { newsId } = req.params;
      const { ingameName, lane, rank, roomId } = req.body;

      // Check if news is room-creation type
      const news = await News.findById(newsId);
      if (!news || news.type !== "room-creation") {
        return res
          .status(400)
          .json({ message: "This news post does not accept registrations" });
      }

      const exists = await Registration.findOne({
        user: req.user.id,
        news: newsId,
      });
      if (exists)
        return res.status(409).json({ message: "Already registered" });

      const reg = await Registration.create({
        user: req.user.id,
        news: newsId,
        ingameName,
        lane,
        rank,
        room: roomId || null,
      });

      res.json(reg);
    } catch (err) {
      next(err);
    }
  }
);

// Get all registrations for a news post
router.get(
  "/news/:newsId",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req, res, next) => {
    try {
      const items = await Registration.find({
        news: req.params.newsId,
      })
        .populate("user", "username ingameName role avatarUrl")
        .populate("room");
      res.json(items);
    } catch (err) {
      next(err);
    }
  }
);

// Get all rooms for a news post (returns CustomRooms created from this news)
router.get("/news/:newsId/rooms", requireAuth, async (req, res, next) => {
  try {
    // Get news title to match custom rooms
    const news = await News.findById(req.params.newsId);
    if (!news) {
      return res.json([]);
    }

    // Find all CustomRooms that start with the news title
    const rooms = await CustomRoom.find({
      title: { $regex: `^${news.title}`, $options: "i" },
    })
      .populate("players", "username ingameName avatarUrl")
      .populate("team1", "username ingameName avatarUrl")
      .populate("team2", "username ingameName avatarUrl")
      .sort({ createdAt: 1 });

    // Transform to match expected format (add roomNumber)
    const roomsWithNumber = rooms.map((room, index) => ({
      ...room.toObject(),
      roomNumber: index + 1,
    }));

    res.json(roomsWithNumber);
  } catch (err) {
    next(err);
  }
});

// Auto-create rooms (admin only)
router.post(
  "/news/:newsId/auto-create-rooms",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req: any, res, next) => {
    try {
      const { newsId } = req.params;
      const { gameMode, bestOf } = req.body;

      // Get news details for title
      const news = await News.findById(newsId);
      if (!news) {
        return res.status(404).json({ message: "News not found" });
      }

      // Check if news is room-creation type
      if (news.type !== "room-creation") {
        return res.status(400).json({
          message: "This news is not a room-creation type",
        });
      }

      // Get all pending registrations that haven't been assigned to a custom room yet
      const registrations = await Registration.find({
        news: newsId,
        status: "pending",
        $or: [{ custom: null }, { custom: { $exists: false } }],
      }).populate("user");

      console.log(
        `Found ${registrations.length} pending registrations for news ${newsId}`
      );

      // Debug: Check all registrations for this news
      const allRegs = await Registration.find({ news: newsId });
      const statusBreakdown = {
        pending: allRegs.filter((r) => r.status === "pending").length,
        assigned: allRegs.filter((r) => r.status === "assigned").length,
        approved: allRegs.filter((r) => r.status === "approved").length,
        rejected: allRegs.filter((r) => r.status === "rejected").length,
        pendingWithCustom: allRegs.filter(
          (r) => r.status === "pending" && r.custom
        ).length,
        pendingWithoutCustom: allRegs.filter(
          (r) => r.status === "pending" && !r.custom
        ).length,
      };
      console.log("Registration status breakdown:", statusBreakdown);

      // Filter out registrations with null/undefined user (in case populate failed)
      const validRegistrations = registrations.filter(
        (r) => r.user && r.user._id
      );

      if (validRegistrations.length < registrations.length) {
        console.warn(
          `Filtered out ${
            registrations.length - validRegistrations.length
          } registrations with invalid user`
        );
      }

      if (validRegistrations.length === 0) {
        // Check if there are any registrations at all
        const totalRegs = await Registration.countDocuments({ news: newsId });
        const assignedRegs = await Registration.countDocuments({
          news: newsId,
          status: "assigned",
        });

        return res.status(200).json({
          message: `No pending registrations to assign. Total: ${totalRegs}, Already assigned: ${assignedRegs}`,
          rooms: [],
          totalRegistrations: totalRegs,
          assignedRegistrations: assignedRegs,
        });
      }

      // Escape special regex characters in news title
      const escapedTitle = news.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // Count existing custom rooms for this news to get next number
      const existingCustoms = await CustomRoom.countDocuments({
        title: { $regex: `^${escapedTitle}`, $options: "i" },
      });

      // New batching logic: only create & assign when we have FULL groups of 10
      const customRooms: any[] = [];
      const batch: any[] = [];
      let roomCounter = existingCustoms + 1;
      let createdCount = 0;

      for (let i = 0; i < validRegistrations.length; i++) {
        const reg = validRegistrations[i];
        if (!reg.user || !reg.user._id) {
          console.warn(`Skipping registration ${reg._id} - no valid user`);
          continue;
        }
        batch.push(reg);

        // When batch reaches 10, create a room and assign
        if (batch.length === 10) {
          const roomTitle = `${news.title} #${roomCounter}`;
          const newRoom = await CustomRoom.create({
            title: roomTitle,
            description: news.content || "",
            scheduleTime: new Date(),
            maxPlayers: 10,
            status: "open", // open when created, will be closed when full
            gameMode: gameMode || "5vs5",
            bestOf: bestOf || 3,
            players: batch.map((r) => r.user._id),
            team1: batch.slice(0, 5).map((r) => r.user._id),
            team2: batch.slice(5, 10).map((r) => r.user._id),
            createdBy: req.user.id,
          });

          customRooms.push(newRoom);
          roomCounter++;
          createdCount++;

          // Assign registrations in this batch
          for (const bReg of batch) {
            bReg.status = "assigned";
            bReg.custom = newRoom._id;
            await bReg.save();
            try {
              await Notification.create({
                user: bReg.user._id,
                type: "room-assignment",
                title: "Bạn đã được xếp phòng",
                message: `Bạn đã được xếp vào ${newRoom.title}. Vui lòng kiểm tra chi tiết.`,
                relatedCustomRoom: newRoom._id,
              });
            } catch (notifErr) {
              console.error(
                `Failed to create notification for user ${bReg.user._id}:`,
                notifErr
              );
            }
          }

          // Reset batch for next room
          batch.length = 0;
        }
      }

      const leftover = batch.length; // players not enough to form a full room

      res.json({
        message:
          createdCount > 0
            ? `Đã tạo ${createdCount} phòng. Còn lại ${leftover} đăng ký chưa đủ để tạo phòng.`
            : `Không thể tạo phòng vì chỉ có ${leftover} đăng ký (cần đủ 10).`,
        rooms: customRooms,
        createdRooms: createdCount,
        leftoverPending: leftover,
        totalPendingProcessed: validRegistrations.length,
      });
    } catch (err) {
      console.error("Auto-create rooms error:", err);
      next(err);
    }
  }
);

// Reset registrations to pending (admin only) - useful when auto-create failed mid-way
router.post(
  "/news/:newsId/reset-assignments",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req: any, res, next) => {
    try {
      const { newsId } = req.params;

      // Update all assigned registrations back to pending and clear custom field
      const result = await Registration.updateMany(
        { news: newsId, status: "assigned" },
        { $set: { status: "pending", custom: null } }
      );

      console.log(
        `Reset ${result.modifiedCount} registrations for news ${newsId}`
      );

      res.json({
        message: `Đã reset ${result.modifiedCount} đăng ký về trạng thái pending`,
        resetCount: result.modifiedCount,
      });
    } catch (err) {
      console.error("Reset assignments error:", err);
      next(err);
    }
  }
);

// Legacy routes for customs (backward compatibility)
router.post("/:customId/register", requireAuth, async (req: any, res, next) => {
  try {
    const { customId } = req.params;
    const exists = await Registration.findOne({
      user: req.user.id,
      custom: customId,
    });
    if (exists) return res.status(409).json({ message: "Already registered" });
    const reg = await Registration.create({
      user: req.user.id,
      custom: customId,
      ingameName: req.body.ingameName || "",
      lane: req.body.lane || "",
      rank: req.body.rank || "",
    });
    res.json(reg);
  } catch (err) {
    next(err);
  }
});

router.get(
  "/:customId/registrations",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req, res, next) => {
    try {
      const items = await Registration.find({
        custom: req.params.customId,
      }).populate("user", "username ingameName role avatarUrl");
      res.json(items);
    } catch (err) {
      next(err);
    }
  }
);

// Register for a custom room
router.post(
  "/:customRoomId/register",
  requireAuth,
  async (req: any, res, next) => {
    try {
      const { customRoomId } = req.params;

      const customRoom = await CustomRoom.findById(customRoomId);
      if (!customRoom) {
        return res.status(404).json({ message: "Custom room not found" });
      }

      // Check if already registered
      const team1Count = customRoom.team1?.length || 0;
      const team2Count = customRoom.team2?.length || 0;
      const totalPlayers = team1Count + team2Count;

      if (totalPlayers >= 10) {
        return res.status(400).json({ message: "Room is full" });
      }

      if (
        customRoom.team1?.includes(req.user.id) ||
        customRoom.team2?.includes(req.user.id)
      ) {
        return res.status(409).json({ message: "Already registered" });
      }

      // Randomly assign to team1 or team2
      const assignToTeam1 = Math.random() < 0.5;

      if (assignToTeam1 && team1Count < 5) {
        customRoom.team1 = [...(customRoom.team1 || []), req.user.id];
      } else if (team2Count < 5) {
        customRoom.team2 = [...(customRoom.team2 || []), req.user.id];
      } else {
        customRoom.team1 = [...(customRoom.team1 || []), req.user.id];
      }

      // Also add to players array
      if (!customRoom.players?.includes(req.user.id)) {
        customRoom.players = [...(customRoom.players || []), req.user.id];
      }

      await customRoom.save();

      res.json({ success: true, message: "Registered successfully" });
    } catch (err) {
      next(err);
    }
  }
);

// Get registrations for custom room (returns team info)
router.get("/:customRoomId/registrations", async (req, res, next) => {
  try {
    const customRoom = await CustomRoom.findById(req.params.customRoomId)
      .populate("team1", "username ingameName avatarUrl")
      .populate("team2", "username ingameName avatarUrl");

    if (!customRoom) {
      return res.status(404).json({ message: "Custom room not found" });
    }

    res.json({
      team1: customRoom.team1 || [],
      team2: customRoom.team2 || [],
    });
  } catch (err) {
    next(err);
  }
});

router.put(
  "/:id/approve",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req, res, next) => {
    try {
      const item = await Registration.findByIdAndUpdate(
        req.params.id,
        { status: "approved" },
        { new: true }
      );
      res.json(item);
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  "/:id/reject",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req, res, next) => {
    try {
      const item = await Registration.findByIdAndUpdate(
        req.params.id,
        { status: "rejected" },
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
      await Registration.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

// Create a registration manually (for admin adding members)
router.post(
  "/",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req, res, next) => {
    try {
      const { news, user, ingameName, lane, rank } = req.body;

      // Check if already registered
      const exists = await Registration.findOne({ user, news });
      if (exists) {
        return res.status(409).json({ message: "User already registered" });
      }

      const reg = await Registration.create({
        user,
        news,
        ingameName: ingameName || "Manual Add",
        lane: lane || "Giữa",
        rank: rank || "Vàng",
        status: "pending",
      });

      res.json(reg);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
