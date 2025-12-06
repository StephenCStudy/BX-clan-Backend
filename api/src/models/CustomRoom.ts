import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const CustomRoomSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    scheduleTime: { type: Date, required: true, index: true },
    maxPlayers: { type: Number, default: 10 },
    players: [{ type: Schema.Types.ObjectId, ref: "User" }],
    team1: [{ type: Schema.Types.ObjectId, ref: "User" }],
    team2: [{ type: Schema.Types.ObjectId, ref: "User" }],
    team1Score: { type: Number, default: 0, min: 0 },
    team2Score: { type: Number, default: 0, min: 0 },
    bestOf: { type: Number, default: 3, min: 1, max: 10 },
    gameMode: {
      type: String,
      enum: ["5vs5", "aram", "draft", "minigame"],
      default: "5vs5",
    },
    status: {
      type: String,
      enum: ["open", "closed", "ongoing"],
      default: "open",
      index: true,
    },
    clan: { type: Schema.Types.ObjectId, ref: "Clan" },

    // ===== TOURNAMENT FIELDS =====
    // Liên kết với giải đấu (nếu phòng được tạo từ giải đấu)
    tournament: { type: Schema.Types.ObjectId, ref: "Tournament", index: true },

    // Liên kết với trận đấu trong giải đấu
    tournamentMatch: { type: Schema.Types.ObjectId, ref: "TournamentMatch" },

    // Team 1 trong giải đấu (lưu để hiển thị thông tin team)
    tournamentTeam1: { type: Schema.Types.ObjectId, ref: "Team" },

    // Team 2 trong giải đấu
    tournamentTeam2: { type: Schema.Types.ObjectId, ref: "Team" },

    // Vòng đấu trong giải đấu
    tournamentRound: { type: Number },

    // Đánh dấu đây là phòng giải đấu
    isTournamentRoom: { type: Boolean, default: false },

    // Team thắng trong giải đấu (được set khi kết thúc phòng)
    winningTeam: { type: Schema.Types.ObjectId, ref: "Team" },

    // Tên team thắng (dùng cho simple tournament room không có Team model)
    winningTeamName: { type: String },

    // Reference tới News đã tạo phòng này (cho simple tournament room)
    newsReference: { type: Schema.Types.ObjectId, ref: "News" },

    // Tên giải đấu (dùng cho simple tournament room)
    tournamentName: { type: String },
  },
  { timestamps: true }
);
type CustomRoomDoc = InferSchemaType<typeof CustomRoomSchema>;

const CustomRoomModel =
  (mongoose.models.CustomRoom as Model<CustomRoomDoc>) ||
  mongoose.model<CustomRoomDoc>("CustomRoom", CustomRoomSchema);

export default CustomRoomModel;
