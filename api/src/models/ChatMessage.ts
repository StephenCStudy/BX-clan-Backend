import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const ChatMessageSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    customRoom: {
      type: Schema.Types.ObjectId,
      ref: "CustomRoom",
      index: true,
    },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

ChatMessageSchema.index({ customRoom: 1, createdAt: -1 });

type ChatMessageDoc = InferSchemaType<typeof ChatMessageSchema>;

const ChatMessageModel =
  (mongoose.models.ChatMessage as Model<ChatMessageDoc>) ||
  mongoose.model<ChatMessageDoc>("ChatMessage", ChatMessageSchema);

export default ChatMessageModel;
