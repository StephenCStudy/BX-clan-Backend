import mongoose, { Schema } from "mongoose";

const InvitationSchema = new Schema(
  {
    inviter: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    inviteeName: { type: String, required: true },
    inviteeContact: { type: String },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Invitation ||
  mongoose.model("Invitation", InvitationSchema);
