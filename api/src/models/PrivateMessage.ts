import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const PrivateMessageSchema = new Schema(
  {
    from: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    to: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Index for querying conversations between two users
PrivateMessageSchema.index({ from: 1, to: 1, createdAt: -1 });
PrivateMessageSchema.index({ to: 1, isRead: 1 });

type PrivateMessageDoc = InferSchemaType<typeof PrivateMessageSchema>;

const PrivateMessageModel =
  (mongoose.models.PrivateMessage as Model<PrivateMessageDoc>) ||
  mongoose.model<PrivateMessageDoc>("PrivateMessage", PrivateMessageSchema);

export default PrivateMessageModel;
