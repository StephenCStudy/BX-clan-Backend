import mongoose, { Schema } from "mongoose";

const StreamSchema = new Schema(
  {
    streamerName: { type: String, required: true },
    platform: {
      type: String,
      enum: ["youtube", "facebook", "twitch"],
      required: true,
    },
    streamUrl: { type: String, required: true },
    scheduleTime: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.models.Stream || mongoose.model("Stream", StreamSchema);
