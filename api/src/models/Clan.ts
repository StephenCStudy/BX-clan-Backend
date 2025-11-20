import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const ClanSchema = new Schema(
  {
    clanName: { type: String, required: true },
    description: { type: String },
    requirements: { type: String },
    bannerUrl: { type: String },
  },
  { timestamps: true }
);
type ClanDoc = InferSchemaType<typeof ClanSchema>;

const ClanModel =
  (mongoose.models.Clan as Model<ClanDoc>) ||
  mongoose.model<ClanDoc>("Clan", ClanSchema);

export default ClanModel;
