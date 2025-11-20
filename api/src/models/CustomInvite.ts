import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const CustomInviteSchema = new Schema(
  {
    customRoom: {
      type: Schema.Types.ObjectId,
      ref: "CustomRoom",
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

type CustomInviteDoc = InferSchemaType<typeof CustomInviteSchema>;

const CustomInviteModel =
  (mongoose.models.CustomInvite as Model<CustomInviteDoc>) ||
  mongoose.model<CustomInviteDoc>("CustomInvite", CustomInviteSchema);

export default CustomInviteModel;
