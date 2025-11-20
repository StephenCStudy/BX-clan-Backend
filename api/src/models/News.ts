import mongoose, { Schema } from "mongoose";

const NewsSchema = new Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    type: {
      type: String,
      enum: ["announcement", "room-creation"],
      default: "announcement",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    clan: { type: Schema.Types.ObjectId, ref: "Clan" },
  },
  { timestamps: true }
);

export default mongoose.models.News || mongoose.model("News", NewsSchema);
