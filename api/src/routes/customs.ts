import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import CustomRoom from "../models/CustomRoom.js";
import Notification from "../models/Notification.js";
import CustomInvite from "../models/CustomInvite.js";
import Tournament from "../models/Tournament.js";
import Team from "../models/Team.js";
import TournamentMatch from "../models/TournamentMatch.js";

const router = Router();

// Helper function to emit socket events
const emitSocketEvent = (req: any, event: string, data: any, room?: string) => {
  const io = req.app.get("io");
  if (io) {
    if (room) {
      io.to(room).emit(event, data);
    } else {
      io.emit(event, data);
    }
  }
};

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
        bestOf,
        gameMode,
        // Tournament fields
        tournamentId,
        team1Id,
        team2Id,
        tournamentRound,
        // Simple tournament room (from News without Team model)
        isTournamentRoom: simpleTournamentRoom,
        newsId,
        tournamentName,
      } = req.body;

      let sanitizedPlayers: string[] = [];
      let team1: string[] = [];
      let team2: string[] = [];
      let tournamentMatch = null;
      let isTournamentRoom = false;

      // Nếu tạo phòng từ giải đấu với Team model
      if (tournamentId && team1Id && team2Id) {
        isTournamentRoom = true;

        // Lấy thông tin tournament
        const tournament = await Tournament.findById(tournamentId);
        if (!tournament) {
          return res.status(404).json({ message: "Không tìm thấy giải đấu" });
        }

        // Lấy thông tin 2 team với members
        const [teamA, teamB] = await Promise.all([
          Team.findById(team1Id).populate(
            "members.user",
            "_id username ingameName avatarUrl"
          ),
          Team.findById(team2Id).populate(
            "members.user",
            "_id username ingameName avatarUrl"
          ),
        ]);

        if (!teamA || !teamB) {
          return res.status(404).json({ message: "Không tìm thấy team" });
        }

        // Lấy danh sách user IDs từ roster của 2 team
        const team1Members = (teamA.members || [])
          .filter((m: any) => m.role !== "substitute")
          .slice(0, tournament.teamSize || 5)
          .map((m: any) => m.user._id || m.user);

        const team2Members = (teamB.members || [])
          .filter((m: any) => m.role !== "substitute")
          .slice(0, tournament.teamSize || 5)
          .map((m: any) => m.user._id || m.user);

        team1 = team1Members;
        team2 = team2Members;
        sanitizedPlayers = [...team1Members, ...team2Members];

        // Tạo TournamentMatch record
        const currentRound = tournamentRound || tournament.currentRound || 1;

        // Đếm số trận đấu trong vòng hiện tại để xác định matchNumber
        const existingMatchesCount = await TournamentMatch.countDocuments({
          tournament: tournamentId,
          round: currentRound,
        });

        tournamentMatch = await TournamentMatch.create({
          tournament: tournamentId,
          round: currentRound,
          matchNumber: existingMatchesCount + 1,
          team1: team1Id,
          team2: team2Id,
          bestOf: bestOf || tournament.defaultBestOf || 3,
          gameMode: gameMode || tournament.gameMode || "5vs5",
          status: "scheduled",
          scheduledTime: scheduleTime,
          createdBy: req.user.id,
        });
      } else if (simpleTournamentRoom) {
        // Tạo phòng giải đấu đơn giản (từ News, không cần Team model)
        isTournamentRoom = true;
        sanitizedPlayers = Array.isArray(players) ? players.slice(0, 10) : [];
        team1 = sanitizedPlayers.slice(0, 5);
        team2 = sanitizedPlayers.slice(5, 10);
      } else {
        // Tạo phòng bình thường (không từ giải đấu)
        sanitizedPlayers = Array.isArray(players) ? players.slice(0, 10) : [];
        team1 = sanitizedPlayers.slice(0, 5);
        team2 = sanitizedPlayers.slice(5, 10);
      }

      const item = await CustomRoom.create({
        title: title || tournamentName || "Custom Room",
        description,
        scheduleTime,
        maxPlayers:
          maxPlayers || (isTournamentRoom ? sanitizedPlayers.length || 10 : 10),
        status: status || "open",
        players: sanitizedPlayers,
        team1,
        team2,
        bestOf: bestOf || 3,
        gameMode: gameMode || "5vs5",
        createdBy: req.user.id,
        // Tournament fields
        isTournamentRoom,
        tournament: tournamentId || undefined,
        tournamentMatch: tournamentMatch?._id || undefined,
        tournamentTeam1: team1Id || undefined,
        tournamentTeam2: team2Id || undefined,
        tournamentRound: tournamentRound || undefined,
        // Simple tournament room reference
        newsReference: newsId || undefined,
        tournamentName: tournamentName || undefined,
      });

      // Cập nhật TournamentMatch với customRoom reference
      if (tournamentMatch) {
        await TournamentMatch.findByIdAndUpdate(tournamentMatch._id, {
          customRoom: item._id,
          status: "scheduled",
        });
      }

      // Gửi notification cho tất cả players được chọn
      if (sanitizedPlayers.length > 0) {
        const notificationTitle = isTournamentRoom
          ? "🏆 Bạn có trận đấu giải"
          : "🎮 Bạn đã được xếp phòng";
        const notificationMessage = isTournamentRoom
          ? `Bạn có trận đấu giải đấu: "${title}". Vui lòng kiểm tra chi tiết.`
          : `Bạn đã được xếp vào phòng "${title}". Vui lòng kiểm tra chi tiết.`;

        const notifications = sanitizedPlayers.map((playerId: string) => ({
          user: playerId,
          type: "room-assignment",
          title: notificationTitle,
          message: notificationMessage,
          relatedCustomRoom: item._id,
        }));
        await Notification.insertMany(notifications);

        // Emit socket notification to each player
        sanitizedPlayers.forEach((playerId: string) => {
          emitSocketEvent(
            req,
            "notification:new",
            {
              type: "room-assignment",
              title: notificationTitle,
              message: notificationMessage,
              relatedCustomRoom: item._id,
            },
            `user:${playerId}`
          );
        });
      }

      // Populate before returning
      const populatedItem = await CustomRoom.findById(item._id)
        .populate("players", "username ingameName avatarUrl")
        .populate("team1", "username ingameName avatarUrl")
        .populate("team2", "username ingameName avatarUrl")
        .populate("createdBy", "username")
        .populate("tournament", "name status currentRound")
        .populate("tournamentTeam1", "name tag logoUrl")
        .populate("tournamentTeam2", "name tag logoUrl");

      // Emit room created event for realtime updates
      emitSocketEvent(req, "custom:created", populatedItem);

      res.json(populatedItem);
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  "/:id",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req, res, next) => {
    try {
      const customRoom = await CustomRoom.findById(req.params.id);
      if (!customRoom) {
        return res.status(404).json({ message: "Không tìm thấy phòng" });
      }

      // Kiểm tra nếu đang đóng phòng tournament mà chưa có team thắng
      if (
        req.body.status === "closed" &&
        customRoom.isTournamentRoom &&
        !customRoom.winningTeam &&
        !customRoom.winningTeamName
      ) {
        // Tự động xác định team thắng dựa trên điểm số
        const team1Score = req.body.team1Score ?? customRoom.team1Score ?? 0;
        const team2Score = req.body.team2Score ?? customRoom.team2Score ?? 0;
        const bestOf = customRoom.bestOf || 3;
        const winsNeeded = Math.ceil(bestOf / 2);

        if (team1Score >= winsNeeded || team2Score >= winsNeeded) {
          // Có team đạt đủ điểm - tự động set winner
          if (team1Score > team2Score) {
            if (customRoom.tournamentTeam1) {
              req.body.winningTeam = customRoom.tournamentTeam1;
            } else {
              req.body.winningTeamName = "team1";
            }
          } else {
            if (customRoom.tournamentTeam2) {
              req.body.winningTeam = customRoom.tournamentTeam2;
            } else {
              req.body.winningTeamName = "team2";
            }
          }
        } else if (team1Score !== team2Score) {
          // Chưa đạt đủ điểm nhưng có team dẫn trước - set winner cho team dẫn
          if (team1Score > team2Score) {
            if (customRoom.tournamentTeam1) {
              req.body.winningTeam = customRoom.tournamentTeam1;
            } else {
              req.body.winningTeamName = "team1";
            }
          } else {
            if (customRoom.tournamentTeam2) {
              req.body.winningTeam = customRoom.tournamentTeam2;
            } else {
              req.body.winningTeamName = "team2";
            }
          }
        } else {
          // Điểm hòa - không cho phép đóng phòng
          return res.status(400).json({
            message:
              "Điểm số đang hòa nhau. Vui lòng chọn team thắng trước khi đóng phòng giải đấu.",
          });
        }
      }

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
    const invite = await CustomInvite.create({
      customRoom: customRoom._id,
      user: userId,
      invitedBy: req.user.id,
      status: "pending",
    });

    // Create notification
    const notification = await Notification.create({
      user: userId,
      type: "custom-invite",
      title: `Lời mời tham gia Custom`,
      message: `Bạn được mời tham gia phòng "${customRoom.title}". Vào trang Custom để chấp nhận.`,
      relatedCustomRoom: customRoom._id,
    });

    // Emit socket notification to invited user
    emitSocketEvent(
      req,
      "notification:new",
      {
        _id: notification._id,
        type: "custom-invite",
        title: `🎮 Lời mời tham gia Custom`,
        message: `Bạn được mời tham gia phòng "${customRoom.title}"`,
        relatedCustomRoom: customRoom._id,
        isRead: false,
        createdAt: notification.createdAt,
      },
      `user:${userId}`
    );

    // Emit invite update event for realtime UI updates
    emitSocketEvent(req, "invite:created", {
      roomId: customRoom._id,
      invite: invite,
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
      const notification = await Notification.create({
        user: invite.user,
        type: "custom-invite",
        title: "Lời mời được chấp nhận",
        message: `Bạn đã được chấp nhận vào phòng "${customRoom.title}"!`,
        relatedCustomRoom: customRoom._id,
      });

      // Emit socket notification to user
      emitSocketEvent(
        req,
        "notification:new",
        {
          _id: notification._id,
          type: "custom-invite",
          title: "✅ Lời mời được chấp nhận",
          message: `Bạn đã được chấp nhận vào phòng "${customRoom.title}"!`,
          relatedCustomRoom: customRoom._id,
          isRead: false,
          createdAt: notification.createdAt,
        },
        `user:${invite.user}`
      );

      // Emit room updated event for realtime UI updates
      const updatedRoom = await CustomRoom.findById(customRoom._id)
        .populate("players", "username ingameName avatarUrl")
        .populate("team1", "username ingameName avatarUrl")
        .populate("team2", "username ingameName avatarUrl");
      emitSocketEvent(req, "custom:updated", updatedRoom);

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

// Update teams (swap/move members between teams)
router.put(
  "/:id/teams",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req, res, next) => {
    try {
      const { team1, team2 } = req.body;
      const customRoom = await CustomRoom.findById(req.params.id);

      if (!customRoom) {
        return res.status(404).json({ message: "Custom room not found" });
      }

      // Validate team sizes
      if ((team1?.length || 0) > 5 || (team2?.length || 0) > 5) {
        return res.status(400).json({ message: "Mỗi đội tối đa 5 người" });
      }

      // Update teams
      customRoom.team1 = team1 || [];
      customRoom.team2 = team2 || [];
      customRoom.players = [...(team1 || []), ...(team2 || [])];

      await customRoom.save();

      // Populate and return updated data
      const updated = await CustomRoom.findById(req.params.id)
        .populate("team1", "username ingameName avatarUrl")
        .populate("team2", "username ingameName avatarUrl")
        .populate("players", "username ingameName avatarUrl");

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /:id/finish-simple-tournament
 * Kết thúc trận đấu giải đấu đơn giản (không có Team model)
 * Dành cho phòng được tạo từ News với isTournamentRoom = true
 */
router.post(
  "/:id/finish-simple-tournament",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req: any, res, next) => {
    try {
      const { winningTeamName, team1Score, team2Score } = req.body;
      const customRoom = await CustomRoom.findById(req.params.id);

      if (!customRoom) {
        return res.status(404).json({ message: "Không tìm thấy phòng" });
      }

      if (!customRoom.isTournamentRoom) {
        return res.status(400).json({
          message: "Phòng này không phải phòng giải đấu",
        });
      }

      // Validate winningTeamName
      if (!["team1", "team2"].includes(winningTeamName)) {
        return res.status(400).json({
          message: "Team thắng phải là team1 hoặc team2",
        });
      }

      // Cập nhật CustomRoom
      customRoom.winningTeamName = winningTeamName;
      customRoom.team1Score = team1Score || 0;
      customRoom.team2Score = team2Score || 0;
      customRoom.status = "closed";
      await customRoom.save();

      // Populate và trả về kết quả
      const populatedRoom = await CustomRoom.findById(customRoom._id)
        .populate("players", "username ingameName avatarUrl")
        .populate("team1", "username ingameName avatarUrl")
        .populate("team2", "username ingameName avatarUrl")
        .populate("createdBy", "username")
        .populate("newsReference", "title");

      // Emit event để cập nhật UI realtime
      emitSocketEvent(req, "custom:updated", populatedRoom);

      res.json({
        success: true,
        message: "Đã kết thúc trận đấu và lưu kết quả",
        customRoom: populatedRoom,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /:id/finish-tournament-match
 * Kết thúc trận đấu giải đấu và lưu team thắng
 * Chỉ dành cho phòng được tạo từ giải đấu (isTournamentRoom = true)
 */
router.post(
  "/:id/finish-tournament-match",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req: any, res, next) => {
    try {
      const { winningTeamId } = req.body;
      const customRoom = await CustomRoom.findById(req.params.id);

      if (!customRoom) {
        return res.status(404).json({ message: "Không tìm thấy phòng" });
      }

      if (!customRoom.isTournamentRoom) {
        return res.status(400).json({
          message: "Phòng này không phải phòng giải đấu",
        });
      }

      if (!customRoom.tournament || !customRoom.tournamentMatch) {
        return res.status(400).json({
          message: "Không tìm thấy thông tin giải đấu liên kết",
        });
      }

      // Validate winningTeamId
      const validTeamIds = [
        customRoom.tournamentTeam1?.toString(),
        customRoom.tournamentTeam2?.toString(),
      ];

      if (!validTeamIds.includes(winningTeamId)) {
        return res.status(400).json({
          message: "Team thắng phải là một trong hai team tham gia trận đấu",
        });
      }

      // Xác định team thua
      const losingTeamId =
        winningTeamId === customRoom.tournamentTeam1?.toString()
          ? customRoom.tournamentTeam2
          : customRoom.tournamentTeam1;

      // Cập nhật CustomRoom
      customRoom.winningTeam = winningTeamId;
      customRoom.status = "closed";
      await customRoom.save();

      // Cập nhật TournamentMatch
      const tournamentMatch = await TournamentMatch.findById(
        customRoom.tournamentMatch
      );
      if (tournamentMatch) {
        tournamentMatch.winner = winningTeamId;
        tournamentMatch.loser = losingTeamId;
        tournamentMatch.status = "completed";
        tournamentMatch.endedAt = new Date();

        // Cập nhật score dựa trên customRoom
        tournamentMatch.team1Score = customRoom.team1Score || 0;
        tournamentMatch.team2Score = customRoom.team2Score || 0;

        await tournamentMatch.save();
      }

      // Cập nhật trạng thái các team
      await Promise.all([
        // Team thắng: vẫn active, tăng số trận thắng
        Team.findByIdAndUpdate(winningTeamId, {
          $inc: { matchesWon: 1 },
          tournamentStatus: "active",
        }),
        // Team thua: đánh dấu bị loại, tăng số trận thua
        Team.findByIdAndUpdate(losingTeamId, {
          $inc: { matchesLost: 1 },
          tournamentStatus: "eliminated",
        }),
      ]);

      // Kiểm tra và cập nhật tournament nếu tất cả trận trong vòng đã hoàn thành
      const tournament = await Tournament.findById(customRoom.tournament);
      if (tournament) {
        const currentRound = tournament.currentRound || 1;

        // Đếm số trận chưa hoàn thành trong vòng hiện tại
        const incompleteMatches = await TournamentMatch.countDocuments({
          tournament: customRoom.tournament,
          round: currentRound,
          status: { $ne: "completed" },
        });

        // Nếu tất cả trận trong vòng đã hoàn thành
        if (incompleteMatches === 0) {
          // Lấy danh sách team thắng trong vòng này
          const completedMatches = await TournamentMatch.find({
            tournament: customRoom.tournament,
            round: currentRound,
            status: "completed",
          });

          const roundWinners = completedMatches
            .filter((m: any) => m.winner)
            .map((m: any) => m.winner);

          // Cập nhật winningTeamsByRound
          const existingRoundIndex = tournament.winningTeamsByRound?.findIndex(
            (r: any) => r.round === currentRound
          );

          if (existingRoundIndex !== undefined && existingRoundIndex >= 0) {
            tournament.winningTeamsByRound![existingRoundIndex].teams =
              roundWinners;
          } else {
            tournament.winningTeamsByRound =
              tournament.winningTeamsByRound || [];
            tournament.winningTeamsByRound.push({
              round: currentRound,
              teams: roundWinners,
            });
          }

          await tournament.save();
        }
      }

      // Populate và trả về kết quả
      const populatedRoom = await CustomRoom.findById(customRoom._id)
        .populate("players", "username ingameName avatarUrl")
        .populate("team1", "username ingameName avatarUrl")
        .populate("team2", "username ingameName avatarUrl")
        .populate("createdBy", "username")
        .populate("tournament", "name status currentRound")
        .populate("tournamentTeam1", "name tag logoUrl")
        .populate("tournamentTeam2", "name tag logoUrl")
        .populate("winningTeam", "name tag logoUrl");

      // Emit event để cập nhật UI realtime
      emitSocketEvent(req, "custom:updated", populatedRoom);
      emitSocketEvent(req, "tournament:match-completed", {
        customRoom: populatedRoom,
        tournament: tournament,
        winningTeamId,
        losingTeamId,
      });

      res.json({
        success: true,
        message: "Đã kết thúc trận đấu và lưu kết quả",
        customRoom: populatedRoom,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /:id - Lấy chi tiết phòng (cập nhật để populate tournament fields)
 */
router.get("/:id", async (req, res, next) => {
  try {
    const item = await CustomRoom.findById(req.params.id)
      .populate("players", "username ingameName avatarUrl")
      .populate("team1", "username ingameName avatarUrl")
      .populate("team2", "username ingameName avatarUrl")
      .populate("createdBy", "username")
      .populate("tournament", "name status currentRound gameMode defaultBestOf")
      .populate({
        path: "tournamentTeam1",
        select: "name tag logoUrl members",
        populate: {
          path: "members.user",
          select: "username ingameName avatarUrl",
        },
      })
      .populate({
        path: "tournamentTeam2",
        select: "name tag logoUrl members",
        populate: {
          path: "members.user",
          select: "username ingameName avatarUrl",
        },
      })
      .populate("winningTeam", "name tag logoUrl");
    res.json(item);
  } catch (err) {
    next(err);
  }
});

export default router;
