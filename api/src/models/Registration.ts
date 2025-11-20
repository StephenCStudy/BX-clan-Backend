import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const RegistrationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    news: {
      type: Schema.Types.ObjectId,
      ref: "News",
      index: true,
    },
    custom: {
      type: Schema.Types.ObjectId,
      ref: "CustomRoom",
      index: true,
    },
    ingameName: { type: String, required: true },
    lane: { type: String, required: true },
    rank: { type: String, required: true },
    room: {
      type: Schema.Types.ObjectId,
      ref: "GameRoom",
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "assigned"],
      default: "pending",
      index: true,
    },
    registeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
type RegistrationDoc = InferSchemaType<typeof RegistrationSchema>;

const RegistrationModel =
  (mongoose.models.Registration as Model<RegistrationDoc>) ||
  mongoose.model<RegistrationDoc>("Registration", RegistrationSchema);

export default RegistrationModel;
