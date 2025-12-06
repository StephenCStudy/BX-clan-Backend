import mongoose, { Schema } from "mongoose";

const NewsSchema = new Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    type: {
      type: String,
      enum: ["announcement", "room-creation", "tournament"],
      default: "announcement",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    clan: { type: Schema.Types.ObjectId, ref: "Clan" },

    // Liên kết với giải đấu (khi type = "tournament")
    tournament: { type: Schema.Types.ObjectId, ref: "Tournament" },
  },
  { timestamps: true }
);

// Index cho việc tìm kiếm theo giải đấu
NewsSchema.index({ tournament: 1 });

export default mongoose.models.News || mongoose.model("News", NewsSchema);
