import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const NotificationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "room-assignment",
        "registration-confirmed",
        "custom-invite",
        "general",
      ],
      default: "general",
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    relatedNews: { type: Schema.Types.ObjectId, ref: "News" },
    relatedRoom: { type: Schema.Types.ObjectId, ref: "GameRoom" },
    relatedCustomRoom: { type: Schema.Types.ObjectId, ref: "CustomRoom" },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

type NotificationDoc = InferSchemaType<typeof NotificationSchema>;

const NotificationModel =
  (mongoose.models.Notification as Model<NotificationDoc>) ||
  mongoose.model<NotificationDoc>("Notification", NotificationSchema);

export default NotificationModel;
