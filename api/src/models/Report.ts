import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const ReportSchema = new Schema(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    target: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "reviewed", "resolved"],
      default: "pending",
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);
type ReportDoc = InferSchemaType<typeof ReportSchema>;

const ReportModel =
  (mongoose.models.Report as Model<ReportDoc>) ||
  mongoose.model<ReportDoc>("Report", ReportSchema);

export default ReportModel;
