import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

export default async function connectDB() {
  try {
    const uri = process.env.MONGO_URI as string;
    if (!uri) {
      throw new Error("MONGO_URI is not defined in environment variables");
    }
    await mongoose.connect(uri);
    console.log("✅ MongoDB connected successfully!");
  } catch (error) {
    throw {
      message: `MongoDB connection failed:, ${(error as any).message}`,
    };
  }
}
