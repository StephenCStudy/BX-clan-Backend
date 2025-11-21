import dotenv from "dotenv";
import connectDB from "./config/db.js";
import app from "./app.js";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import ChatMessage from "./models/ChatMessage.js";
import PrivateMessage from "./models/PrivateMessage.js";
import Notification from "./models/Notification.js";
import GameRoom from "./models/GameRoom.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB();
    const server = http.createServer(app);

    const io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(",") || "*",
        credentials: true,
      },
    });

    io.on("connection", (socket) => {
      console.log("User connected:", socket.id);

      // User joins their personal room for receiving private messages
      socket.on("user:join", (userId: string) => {
        if (userId) {
          socket.join(`user:${userId}`);
          console.log(`User ${userId} joined their room`);
        }
      });

      // Public chat message (for custom rooms)
      socket.on(
        "message:send",
        async (payload: { userId: string; message: string }) => {
          try {
            if (!payload?.message || !payload?.userId) return;
            const doc = await ChatMessage.create({
              user: payload.userId,
              message: payload.message,
            });
            io.emit("message:receive", {
              id: String(doc._id),
              user: String(doc.user),
              message: doc.message,
              createdAt: doc.createdAt,
            });
          } catch (err) {
            console.error("Error creating public chat message:", err);
          }
        }
      );

      // Private message
      socket.on(
        "private:send",
        async (payload: {
          from: string;
          to: string;
          message: string;
          fromUser?: any;
        }) => {
          try {
            if (!payload?.from || !payload?.to || !payload?.message) return;

            // Save to database
            const doc = await PrivateMessage.create({
              from: payload.from,
              to: payload.to,
              message: payload.message,
            });

            // Populate for response
            await doc.populate("from", "username avatarUrl role");
            await doc.populate("to", "username avatarUrl role");

            // Send to recipient's room
            io.to(`user:${payload.to}`).emit("private:receive", {
              _id: doc._id,
              from: doc.from,
              to: doc.to,
              message: doc.message,
              isRead: doc.isRead,
              createdAt: doc.createdAt,
            });

            // Send back to sender for confirmation
            socket.emit("private:sent", {
              _id: doc._id,
              from: doc.from,
              to: doc.to,
              message: doc.message,
              isRead: doc.isRead,
              createdAt: doc.createdAt,
            });

            // Create notification for recipient (only if they're admin)
            const recipientUser = doc.to as any;
            if (
              recipientUser.role === "leader" ||
              recipientUser.role === "organizer" ||
              recipientUser.role === "moderator"
            ) {
              const senderUser = doc.from as any;
              await Notification.create({
                user: payload.to,
                type: "general",
                title: "💬 Tin nhắn mới",
                message: `${
                  senderUser.username
                } đã gửi tin nhắn cho bạn: "${payload.message.substring(
                  0,
                  50
                )}${payload.message.length > 50 ? "..." : ""}"`,
              });

              // Emit notification event
              io.to(`user:${payload.to}`).emit("notification:new", {
                type: "general",
                title: "💬 Tin nhắn mới",
                message: `${senderUser.username} đã gửi tin nhắn`,
              });
            }
          } catch (error) {
            console.error("Error sending private message:", error);
          }
        }
      );

      socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
      });
    });

    server.listen(PORT, () => {
      console.log(` ----------- Server running on port [${PORT}]  ----------------`);
    });
  } catch (err) {
    console.error("Fatal error starting server:", err);
    process.exit(1);
  }
})();
