import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import Tournament from "../models/Tournament.js";
import Team from "../models/Team.js";
import TournamentMatch from "../models/TournamentMatch.js";
import News from "../models/News.js";

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

/**
 * GET /tournaments
 * Lấy danh sách giải đấu
 */
router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const status = req.query.status as string;
    const skip = (page - 1) * limit;

    const query: any = search
      ? { name: { $regex: search, $options: "i" } }
      : {};

    if (status && status !== "all") {
      query.status = status;
    }

    const total = await Tournament.countDocuments(query);
    const items = await Tournament.find(query)
      .populate("createdBy", "username")
      .populate("registeredTeams", "name tag logoUrl")
      .populate("champion", "name tag logoUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ items, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /tournaments/for-room-creation
 * Lấy danh sách giải đấu có type="tournament" (dùng để tạo phòng)
 */
router.get("/for-room-creation", async (req, res, next) => {
  try {
    const tournaments = await Tournament.find({
      status: { $in: ["ongoing", "registration"] },
    })
      .populate("registeredTeams", "name tag logoUrl")
      .sort({ createdAt: -1 });

    res.json(tournaments);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /tournaments/:id
 * Lấy chi tiết giải đấu
 */
router.get("/:id", async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate("createdBy", "username")
      .populate("registeredTeams", "name tag logoUrl captain members")
      .populate("champion", "name tag logoUrl")
      .populate({
        path: "winningTeamsByRound.teams",
        select: "name tag logoUrl",
      });

    if (!tournament) {
      return res.status(404).json({ message: "Không tìm thấy giải đấu" });
    }

    res.json(tournament);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /tournaments/:id/winning-teams
 * Lấy danh sách team thắng trong giải đấu (cho việc tạo phòng mới)
 * Logic:
 * - Vòng 1: Lấy tất cả registered teams
 * - Vòng 2+: Lấy team thắng từ vòng trước
 */
router.get("/:id/winning-teams", async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate({
        path: "registeredTeams",
        select: "name tag logoUrl captain members tournamentStatus",
        populate: {
          path: "members.user",
          select: "username ingameName avatarUrl",
        },
      })
      .populate({
        path: "winningTeamsByRound.teams",
        select: "name tag logoUrl captain members tournamentStatus",
        populate: {
          path: "members.user",
          select: "username ingameName avatarUrl",
        },
      });

    if (!tournament) {
      return res.status(404).json({ message: "Không tìm thấy giải đấu" });
    }

    const currentRound = tournament.currentRound || 1;
    let availableTeams: any[] = [];

    if (currentRound === 1) {
      // Vòng 1: Lấy tất cả team đã đăng ký và còn active
      availableTeams = (tournament.registeredTeams as any[]).filter(
        (team: any) => team.tournamentStatus !== "eliminated"
      );
    } else {
      // Vòng 2+: Lấy team thắng từ vòng trước
      const previousRound = tournament.winningTeamsByRound?.find(
        (r: any) => r.round === currentRound - 1
      );
      if (previousRound && previousRound.teams) {
        availableTeams = previousRound.teams;
      }
    }

    // Lấy danh sách các team đã có trận đấu trong vòng hiện tại (để loại trừ)
    const existingMatches = await TournamentMatch.find({
      tournament: req.params.id,
      round: currentRound,
      status: { $ne: "cancelled" },
    });

    const teamsInCurrentRound = new Set<string>();
    existingMatches.forEach((match: any) => {
      teamsInCurrentRound.add(match.team1.toString());
      teamsInCurrentRound.add(match.team2.toString());
    });

    // Lọc ra các team chưa có trận đấu trong vòng hiện tại
    const teamsNotInMatch = availableTeams.filter(
      (team: any) => !teamsInCurrentRound.has(team._id.toString())
    );

    res.json({
      currentRound,
      allAvailableTeams: availableTeams,
      teamsNotInMatch,
      totalTeamsInRound: availableTeams.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /tournaments/:id/matches
 * Lấy danh sách trận đấu trong giải đấu
 */
router.get("/:id/matches", async (req, res, next) => {
  try {
    const round = req.query.round
      ? parseInt(req.query.round as string)
      : undefined;

    const query: any = { tournament: req.params.id };
    if (round) {
      query.round = round;
    }

    const matches = await TournamentMatch.find(query)
      .populate({
        path: "team1",
        select: "name tag logoUrl members",
        populate: {
          path: "members.user",
          select: "username ingameName avatarUrl",
        },
      })
      .populate({
        path: "team2",
        select: "name tag logoUrl members",
        populate: {
          path: "members.user",
          select: "username ingameName avatarUrl",
        },
      })
      .populate("winner", "name tag logoUrl")
      .populate("customRoom", "title status team1Score team2Score")
      .sort({ round: 1, matchNumber: 1 });

    res.json(matches);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /tournaments
 * Tạo giải đấu mới
 */
router.post(
  "/",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req: any, res, next) => {
    try {
      const {
        name,
        description,
        gameType,
        gameMode,
        defaultBestOf,
        maxTeams,
        teamSize,
        startDate,
        endDate,
        createNews,
      } = req.body;

      const tournament = await Tournament.create({
        name,
        description,
        gameType,
        gameMode: gameMode || "5vs5",
        defaultBestOf: defaultBestOf || 3,
        maxTeams: maxTeams || 8,
        teamSize: teamSize || 5,
        startDate,
        endDate,
        status: "draft",
        createdBy: req.user.id,
      });

      // Tạo tin tức giải đấu nếu được yêu cầu
      if (createNews) {
        const news = await News.create({
          title: `🏆 Giải đấu: ${name}`,
          content: description || `Giải đấu ${name} đã được tạo. Đăng ký ngay!`,
          type: "tournament",
          tournament: tournament._id,
          createdBy: req.user.id,
        });

        // Cập nhật link tin tức vào giải đấu
        tournament.relatedNews = news._id;
        await tournament.save();
      }

      const populatedTournament = await Tournament.findById(
        tournament._id
      ).populate("createdBy", "username");

      emitSocketEvent(req, "tournament:created", populatedTournament);

      res.json(populatedTournament);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /tournaments/:id
 * Cập nhật giải đấu
 */
router.put(
  "/:id",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req: any, res, next) => {
    try {
      const {
        name,
        description,
        gameType,
        gameMode,
        defaultBestOf,
        maxTeams,
        teamSize,
        startDate,
        endDate,
        status,
        currentRound,
      } = req.body;

      const tournament = await Tournament.findByIdAndUpdate(
        req.params.id,
        {
          name,
          description,
          gameType,
          gameMode,
          defaultBestOf,
          maxTeams,
          teamSize,
          startDate,
          endDate,
          status,
          currentRound,
        },
        { new: true }
      ).populate("createdBy", "username");

      if (!tournament) {
        return res.status(404).json({ message: "Không tìm thấy giải đấu" });
      }

      emitSocketEvent(req, "tournament:updated", tournament);

      res.json(tournament);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /tournaments/:id/advance-round
 * Chuyển sang vòng tiếp theo
 */
router.post(
  "/:id/advance-round",
  requireAuth,
  requireRoles("organizer", "leader", "moderator"),
  async (req: any, res, next) => {
    try {
      const tournament = await Tournament.findById(req.params.id);

      if (!tournament) {
        return res.status(404).json({ message: "Không tìm thấy giải đấu" });
      }

      // Kiểm tra tất cả trận đấu trong vòng hiện tại đã hoàn thành chưa
      const currentRoundMatches = await TournamentMatch.find({
        tournament: req.params.id,
        round: tournament.currentRound,
        status: { $ne: "cancelled" },
      });

      const allCompleted = currentRoundMatches.every(
        (match: any) => match.status === "completed"
      );

      if (!allCompleted) {
        return res.status(400).json({
          message: "Vẫn còn trận đấu chưa hoàn thành trong vòng hiện tại",
        });
      }

      // Lấy danh sách team thắng trong vòng hiện tại
      const winners = currentRoundMatches
        .filter((match: any) => match.winner)
        .map((match: any) => match.winner);

      // Lưu team thắng cho vòng hiện tại
      const existingRoundIndex = tournament.winningTeamsByRound?.findIndex(
        (r: any) => r.round === tournament.currentRound
      );

      if (existingRoundIndex !== undefined && existingRoundIndex >= 0) {
        tournament.winningTeamsByRound![existingRoundIndex].teams = winners;
      } else {
        tournament.winningTeamsByRound = tournament.winningTeamsByRound || [];
        tournament.winningTeamsByRound.push({
          round: tournament.currentRound!,
          teams: winners,
        });
      }

      // Kiểm tra nếu chỉ còn 1 team thắng -> giải đấu kết thúc
      if (winners.length === 1) {
        tournament.champion = winners[0];
        tournament.status = "completed";

        // Cập nhật team thắng
        await Team.findByIdAndUpdate(winners[0], {
          tournamentStatus: "winner",
        });
      } else {
        // Chuyển sang vòng tiếp theo
        tournament.currentRound = (tournament.currentRound || 1) + 1;
      }

      await tournament.save();

      const updatedTournament = await Tournament.findById(tournament._id)
        .populate("createdBy", "username")
        .populate("registeredTeams", "name tag logoUrl")
        .populate("champion", "name tag logoUrl");

      emitSocketEvent(req, "tournament:updated", updatedTournament);

      res.json(updatedTournament);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /tournaments/:id
 * Xóa giải đấu
 */
router.delete(
  "/:id",
  requireAuth,
  requireRoles("organizer", "leader"),
  async (req, res, next) => {
    try {
      const tournament = await Tournament.findById(req.params.id);

      if (!tournament) {
        return res.status(404).json({ message: "Không tìm thấy giải đấu" });
      }

      // Xóa tin tức liên quan
      if (tournament.relatedNews) {
        await News.findByIdAndDelete(tournament.relatedNews);
      }

      // Xóa các trận đấu
      await TournamentMatch.deleteMany({ tournament: req.params.id });

      // Xóa giải đấu
      await Tournament.findByIdAndDelete(req.params.id);

      res.json({ success: true, message: "Đã xóa giải đấu" });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
