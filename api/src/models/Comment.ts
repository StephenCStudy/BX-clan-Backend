import mongoose, { Schema } from "mongoose";

const CommentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    news: {
      type: Schema.Types.ObjectId,
      ref: "News",
      required: true,
      index: true,
    },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.models.Comment ||
  mongoose.model("Comment", CommentSchema);
