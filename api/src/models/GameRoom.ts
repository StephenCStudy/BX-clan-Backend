import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const GameRoomSchema = new Schema(
  {
    news: {
      type: Schema.Types.ObjectId,
      ref: "News",
      required: true,
      index: true,
    },
    roomNumber: { type: Number, required: true },
    players: [
      {
        type: Schema.Types.ObjectId,
        ref: "Registration",
      },
    ],
    maxPlayers: { type: Number, default: 10 },
    status: {
      type: String,
      enum: ["open", "full", "closed"],
      default: "open",
      index: true,
    },
  },
  { timestamps: true }
);

type GameRoomDoc = InferSchemaType<typeof GameRoomSchema>;

const GameRoomModel =
  (mongoose.models.GameRoom as Model<GameRoomDoc>) ||
  mongoose.model<GameRoomDoc>("GameRoom", GameRoomSchema);

export default GameRoomModel;
