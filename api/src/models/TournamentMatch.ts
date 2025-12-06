import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * TournamentMatch Model
 * Lưu trữ thông tin từng trận đấu trong giải đấu
 */
const TournamentMatchSchema = new Schema(
  {
    // Giải đấu
    tournament: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },

    // Vòng đấu (1 = vòng 1, 2 = tứ kết, 3 = bán kết, 4 = chung kết, etc.)
    round: { type: Number, required: true, min: 1 },

    // Số thứ tự trận đấu trong vòng (match 1, match 2, etc.)
    matchNumber: { type: Number, required: true, min: 1 },

    // Team 1
    team1: {
      type: Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },

    // Team 2
    team2: {
      type: Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },

    // Điểm team 1 (số trận thắng)
    team1Score: { type: Number, default: 0, min: 0 },

    // Điểm team 2 (số trận thắng)
    team2Score: { type: Number, default: 0, min: 0 },

    // Best of
    bestOf: { type: Number, default: 3, min: 1, max: 10 },

    // Team thắng (được set sau khi trận đấu kết thúc)
    winner: { type: Schema.Types.ObjectId, ref: "Team" },

    // Team thua
    loser: { type: Schema.Types.ObjectId, ref: "Team" },

    // Trạng thái trận đấu
    status: {
      type: String,
      enum: ["scheduled", "ongoing", "completed", "cancelled"],
      default: "scheduled",
    },

    // Thời gian dự kiến
    scheduledTime: { type: Date },

    // Thời gian bắt đầu thực tế
    startedAt: { type: Date },

    // Thời gian kết thúc
    endedAt: { type: Date },

    // Custom room liên kết (nếu có)
    customRoom: { type: Schema.Types.ObjectId, ref: "CustomRoom" },

    // Chế độ chơi
    gameMode: {
      type: String,
      enum: ["5vs5", "aram", "draft", "minigame"],
      default: "5vs5",
    },

    // Ghi chú
    notes: { type: String },

    // Người tạo trận đấu
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Index để tìm kiếm nhanh
TournamentMatchSchema.index({ tournament: 1, round: 1 });
TournamentMatchSchema.index({ team1: 1 });
TournamentMatchSchema.index({ team2: 1 });
TournamentMatchSchema.index({ winner: 1 });
TournamentMatchSchema.index({ status: 1 });

type TournamentMatchDoc = InferSchemaType<typeof TournamentMatchSchema>;

const TournamentMatchModel =
  (mongoose.models.TournamentMatch as Model<TournamentMatchDoc>) ||
  mongoose.model<TournamentMatchDoc>("TournamentMatch", TournamentMatchSchema);

export default TournamentMatchModel;
