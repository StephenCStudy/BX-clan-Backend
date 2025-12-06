import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import "./models/GameRoom.js"; // Ensure GameRoom model is registered
import authRoutes from "./routes/auth.js";
import clanRoutes from "./routes/clan.js";
import memberRoutes from "./routes/members.js";
import customRoutes from "./routes/customs.js";
import registrationRoutes from "./routes/registrations.js";
import reportRoutes from "./routes/reports.js";
import newsRoutes from "./routes/news.js";
import streamRoutes from "./routes/streams.js";
import chatRoutes from "./routes/chat.js";
import notificationRoutes from "./routes/notifications.js";
import privateMessageRoutes from "./routes/privateMessages.js";
import tournamentRoutes from "./routes/tournaments.js";
import teamRoutes from "./routes/teams.js";
import { errorHandler } from "./utils/errorHandler.js";

dotenv.config();

const app = express();
const allowedOrigins = process.env.CORS_ORIGIN?.split(",") || [
  "https://bxclan.vercel.app",
];

const corsOptions = {
  origin: (origin: any, callback: any) => {
    if (!origin) return callback(null, true);
    // Allow explicit origins from env
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    // Allow localhost for development
    if (
      origin === "http://localhost:5173" ||
      origin === "http://localhost:3000"
    )
      return callback(null, true);
    // Allow any vercel.app subdomain
    try {
      if (origin.endsWith(".vercel.app")) return callback(null, true);
    } catch (e) {
      // ignore
    }
    return callback(new Error("CORS policy: origin not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
};

app.use(cors(corsOptions));
// The global `cors` middleware above already handles preflight OPTIONS requests
// so an explicit `app.options('*', ...)` is not required.
app.use(express.json());
app.use(cookieParser());

app.get("/", (_req, res) => {
  res.send("API is running...");
});

app.use("/api/auth", authRoutes);
app.use("/api/clan", clanRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/customs", customRoutes);
app.use("/api/registrations", registrationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/streams", streamRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/private-messages", privateMessageRoutes);
app.use("/api/tournaments", tournamentRoutes);
app.use("/api/teams", teamRoutes);

app.use(errorHandler);

export default app;
