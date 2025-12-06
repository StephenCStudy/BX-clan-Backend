import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Team Model
 * Lưu trữ thông tin team tham gia giải đấu
 */
const TeamSchema = new Schema(
  {
    // Tên team
    name: { type: String, required: true },

    // Tag team (viết tắt, ví dụ: "T1", "GEN", "DK")
    tag: { type: String, maxlength: 5 },

    // Logo team (URL)
    logoUrl: { type: String },

    // Mô tả team
    description: { type: String },

    // Đội trưởng
    captain: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Danh sách thành viên (roster)
    members: [
      {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        role: {
          type: String,
          enum: ["captain", "player", "substitute"],
          default: "player",
        },
        position: {
          type: String,
          enum: ["Baron", "Rừng", "Giữa", "Rồng", "Hỗ Trợ", "Substitute"],
          default: "Substitute",
        },
        joinedAt: { type: Date, default: Date.now },
      },
    ],

    // Giải đấu team đang tham gia
    tournament: { type: Schema.Types.ObjectId, ref: "Tournament" },

    // Trạng thái team trong giải đấu
    tournamentStatus: {
      type: String,
      enum: ["registered", "active", "eliminated", "winner"],
      default: "registered",
    },

    // Số trận đã thắng trong giải đấu
    matchesWon: { type: Number, default: 0 },

    // Số trận đã thua trong giải đấu
    matchesLost: { type: Number, default: 0 },

    // Vòng đấu hiện tại của team trong giải đấu
    currentRound: { type: Number, default: 1 },

    // Trạng thái team
    status: {
      type: String,
      enum: ["active", "inactive", "disbanded"],
      default: "active",
    },

    // Người tạo team
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Clan liên quan (optional)
    clan: { type: Schema.Types.ObjectId, ref: "Clan" },
  },
  { timestamps: true }
);

// Index để tìm kiếm nhanh
TeamSchema.index({ tournament: 1 });
TeamSchema.index({ captain: 1 });
TeamSchema.index({ "members.user": 1 });
TeamSchema.index({ tournamentStatus: 1 });

type TeamDoc = InferSchemaType<typeof TeamSchema>;

const TeamModel =
  (mongoose.models.Team as Model<TeamDoc>) ||
  mongoose.model<TeamDoc>("Team", TeamSchema);

export default TeamModel;
