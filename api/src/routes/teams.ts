import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import Team from "../models/Team.js";
import Tournament from "../models/Tournament.js";

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
 * GET /teams
 * Lấy danh sách team
 */
router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const tournamentId = req.query.tournament as string;
    const skip = (page - 1) * limit;

    const query: any = search
      ? { name: { $regex: search, $options: "i" } }
      : {};

    if (tournamentId) {
      query.tournament = tournamentId;
    }

    const total = await Team.countDocuments(query);
    const items = await Team.find(query)
      .populate("captain", "username ingameName avatarUrl")
      .populate("members.user", "username ingameName avatarUrl")
      .populate("tournament", "name status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ items, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /teams/:id
 * Lấy chi tiết team
 */
router.get("/:id", async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate("captain", "username ingameName avatarUrl")
      .populate("members.user", "username ingameName avatarUrl")
      .populate("tournament", "name status currentRound")
      .populate("createdBy", "username");

    if (!team) {
      return res.status(404).json({ message: "Không tìm thấy team" });
    }

    res.json(team);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /teams
 * Tạo team mới
 */
router.post("/", requireAuth, async (req: any, res, next) => {
  try {
    const { name, tag, logoUrl, description, members, tournamentId } = req.body;

    // Kiểm tra giải đấu nếu có
    let tournament = null;
    if (tournamentId) {
      tournament = await Tournament.findById(tournamentId);
      if (!tournament) {
        return res.status(404).json({ message: "Không tìm thấy giải đấu" });
      }

      // Kiểm tra giải đấu còn nhận đăng ký không
      if (
        tournament.status !== "registration" &&
        tournament.status !== "draft"
      ) {
        return res.status(400).json({
          message: "Giải đấu không còn nhận đăng ký team mới",
        });
      }

      // Kiểm tra số team đã đăng ký
      if (
        tournament.registeredTeams &&
        tournament.registeredTeams.length >= (tournament.maxTeams || 8)
      ) {
        return res.status(400).json({
          message: "Giải đấu đã đủ số team tối đa",
        });
      }
    }

    // Tạo danh sách members với captain là người tạo
    const teamMembers = [
      {
        user: req.user.id,
        role: "captain",
        position: "Substitute",
      },
    ];

    // Thêm các thành viên khác nếu có
    if (members && Array.isArray(members)) {
      members.forEach((member: any) => {
        if (member.userId !== req.user.id) {
          teamMembers.push({
            user: member.userId,
            role: member.role || "player",
            position: member.position || "Substitute",
          });
        }
      });
    }

    const team = await Team.create({
      name,
      tag,
      logoUrl,
      description,
      captain: req.user.id,
      members: teamMembers,
      tournament: tournamentId || undefined,
      tournamentStatus: tournamentId ? "registered" : undefined,
      createdBy: req.user.id,
    });

    // Nếu có giải đấu, thêm team vào danh sách đăng ký
    if (tournament) {
      tournament.registeredTeams = tournament.registeredTeams || [];
      tournament.registeredTeams.push(team._id as any);
      await tournament.save();
    }

    const populatedTeam = await Team.findById(team._id)
      .populate("captain", "username ingameName avatarUrl")
      .populate("members.user", "username ingameName avatarUrl")
      .populate("tournament", "name status");

    emitSocketEvent(req, "team:created", populatedTeam);

    res.json(populatedTeam);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /teams/:id
 * Cập nhật team
 */
router.put("/:id", requireAuth, async (req: any, res, next) => {
  try {
    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ message: "Không tìm thấy team" });
    }

    // Kiểm tra quyền: chỉ captain hoặc admin mới được sửa
    const isAdmin = ["organizer", "leader", "moderator"].includes(
      req.user.role
    );
    const isCaptain = team.captain.toString() === req.user.id;

    if (!isAdmin && !isCaptain) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền sửa team này" });
    }

    const { name, tag, logoUrl, description, members, status } = req.body;

    const updateData: any = {};
    if (name) updateData.name = name;
    if (tag) updateData.tag = tag;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
    if (description !== undefined) updateData.description = description;
    if (status) updateData.status = status;

    // Cập nhật members nếu có
    if (members && Array.isArray(members)) {
      updateData.members = members.map((member: any) => ({
        user: member.userId || member.user,
        role: member.role || "player",
        position: member.position || "Substitute",
      }));
    }

    const updatedTeam = await Team.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
      .populate("captain", "username ingameName avatarUrl")
      .populate("members.user", "username ingameName avatarUrl")
      .populate("tournament", "name status");

    emitSocketEvent(req, "team:updated", updatedTeam);

    res.json(updatedTeam);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /teams/:id/members
 * Thêm thành viên vào team
 */
router.post("/:id/members", requireAuth, async (req: any, res, next) => {
  try {
    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ message: "Không tìm thấy team" });
    }

    // Kiểm tra quyền
    const isAdmin = ["organizer", "leader", "moderator"].includes(
      req.user.role
    );
    const isCaptain = team.captain.toString() === req.user.id;

    if (!isAdmin && !isCaptain) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền thêm thành viên" });
    }

    const { userId, role, position } = req.body;

    // Kiểm tra user đã trong team chưa
    const existingMember = team.members?.find(
      (m: any) => m.user.toString() === userId
    );
    if (existingMember) {
      return res.status(400).json({ message: "Thành viên đã trong team" });
    }

    // Kiểm tra giới hạn số thành viên (nếu đang trong giải đấu)
    if (team.tournament) {
      const tournament = await Tournament.findById(team.tournament);
      if (
        tournament &&
        team.members &&
        team.members.length >= (tournament.teamSize || 5) + 2
      ) {
        return res.status(400).json({
          message: `Team đã đủ số thành viên tối đa (${
            (tournament.teamSize || 5) + 2
          })`,
        });
      }
    }

    team.members = team.members || [];
    team.members.push({
      user: userId,
      role: role || "player",
      position: position || "Substitute",
      joinedAt: new Date(),
    });

    await team.save();

    const updatedTeam = await Team.findById(team._id)
      .populate("captain", "username ingameName avatarUrl")
      .populate("members.user", "username ingameName avatarUrl");

    res.json(updatedTeam);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /teams/:id/members/:memberId
 * Xóa thành viên khỏi team
 */
router.delete(
  "/:id/members/:memberId",
  requireAuth,
  async (req: any, res, next) => {
    try {
      const team = await Team.findById(req.params.id);

      if (!team) {
        return res.status(404).json({ message: "Không tìm thấy team" });
      }

      // Kiểm tra quyền
      const isAdmin = ["organizer", "leader", "moderator"].includes(
        req.user.role
      );
      const isCaptain = team.captain.toString() === req.user.id;

      if (!isAdmin && !isCaptain) {
        return res
          .status(403)
          .json({ message: "Bạn không có quyền xóa thành viên" });
      }

      // Không cho phép xóa captain
      if (team.captain.toString() === req.params.memberId) {
        return res.status(400).json({ message: "Không thể xóa đội trưởng" });
      }

      team.members = (team.members || []).filter(
        (m: any) => m.user.toString() !== req.params.memberId
      );

      await team.save();

      const updatedTeam = await Team.findById(team._id)
        .populate("captain", "username ingameName avatarUrl")
        .populate("members.user", "username ingameName avatarUrl");

      res.json(updatedTeam);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /teams/:id
 * Xóa team
 */
router.delete("/:id", requireAuth, async (req: any, res, next) => {
  try {
    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ message: "Không tìm thấy team" });
    }

    // Kiểm tra quyền
    const isAdmin = ["organizer", "leader"].includes(req.user.role);
    const isCaptain = team.captain.toString() === req.user.id;

    if (!isAdmin && !isCaptain) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền xóa team này" });
    }

    // Nếu team đang trong giải đấu, xóa khỏi danh sách đăng ký
    if (team.tournament) {
      await Tournament.findByIdAndUpdate(team.tournament, {
        $pull: { registeredTeams: team._id },
      });
    }

    await Team.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: "Đã xóa team" });
  } catch (err) {
    next(err);
  }
});

export default router;
