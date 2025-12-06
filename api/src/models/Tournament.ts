import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Tournament Model
 * Lưu trữ thông tin giải đấu và theo dõi các team thắng qua từng vòng
 */
const TournamentSchema = new Schema(
  {
    // Tên giải đấu
    name: { type: String, required: true },

    // Mô tả giải đấu
    description: { type: String },

    // Loại game (ví dụ: League of Legends, PUBG, etc.)
    gameType: { type: String, default: "League of Legends" },

    // Chế độ chơi mặc định cho giải đấu
    gameMode: {
      type: String,
      enum: ["5vs5", "aram", "draft", "minigame"],
      default: "5vs5",
    },

    // Best of mặc định cho các trận đấu
    defaultBestOf: { type: Number, default: 3, min: 1, max: 10 },

    // Số lượng team tham gia tối đa
    maxTeams: { type: Number, default: 8 },

    // Số người mỗi team
    teamSize: { type: Number, default: 5 },

    // Trạng thái giải đấu
    status: {
      type: String,
      enum: ["draft", "registration", "ongoing", "completed", "cancelled"],
      default: "draft",
    },

    // Vòng đấu hiện tại (1 = vòng 1, 2 = bán kết, 3 = chung kết, etc.)
    currentRound: { type: Number, default: 1 },

    // Thời gian bắt đầu giải đấu
    startDate: { type: Date },

    // Thời gian kết thúc giải đấu
    endDate: { type: Date },

    // Danh sách team đăng ký tham gia giải đấu
    registeredTeams: [{ type: Schema.Types.ObjectId, ref: "Team" }],

    // Danh sách team thắng (được cập nhật sau mỗi trận đấu)
    // Lưu theo từng vòng: { round: 1, teams: [teamIds] }
    winningTeamsByRound: [
      {
        round: { type: Number, required: true },
        teams: [{ type: Schema.Types.ObjectId, ref: "Team" }],
      },
    ],

    // Team vô địch (được set khi giải đấu kết thúc)
    champion: { type: Schema.Types.ObjectId, ref: "Team" },

    // Người tạo giải đấu
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Clan tổ chức (optional)
    clan: { type: Schema.Types.ObjectId, ref: "Clan" },

    // Tin tức liên quan đến giải đấu
    relatedNews: { type: Schema.Types.ObjectId, ref: "News" },
  },
  { timestamps: true }
);

// Index để tìm kiếm nhanh
TournamentSchema.index({ status: 1 });
TournamentSchema.index({ createdBy: 1 });
TournamentSchema.index({ "winningTeamsByRound.round": 1 });

type TournamentDoc = InferSchemaType<typeof TournamentSchema>;

const TournamentModel =
  (mongoose.models.Tournament as Model<TournamentDoc>) ||
  mongoose.model<TournamentDoc>("Tournament", TournamentSchema);

export default TournamentModel;
