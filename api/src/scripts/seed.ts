import connectDB from "../config/db.js";
import Clan from "../models/Clan.js";
import User from "../models/User.js";
import CustomRoom from "../models/CustomRoom.js";
import Registration from "../models/Registration.js";
import Report from "../models/Report.js";
import News from "../models/News.js";
import bcrypt from "bcryptjs";
(async () => {
  try {
    await connectDB();
    await Promise.all([
      User.deleteMany({}),
      Clan.deleteMany({}),
      CustomRoom.deleteMany({}),
      Registration.deleteMany({}),
      Report.deleteMany({}),
      News.deleteMany({}),
    ]);

    // Create default clan
    const clan = await Clan.create({
      clanName: "BX Clan",
      description: "Clan Wild Rift hàng đầu Việt Nam.",
      bannerUrl:
        "https://images.unsplash.com/photo-1606112219348-204d7d8b94ee?q=80&w=2069&auto=format&fit=crop",
    });

    // Seed a leader account with highest privileges
    const leaderPassword = process.env.SEED_LEADER_PWD || "Leader@1234";
    const hashed = bcrypt.hashSync(leaderPassword, 10);

    const leader = await User.create({
      username: process.env.SEED_LEADER_USERNAME || "leader",
      password: hashed,
      ingameName: process.env.SEED_LEADER_IGN || "BX_Leader",
      role: "leader",
      rank: process.env.SEED_LEADER_RANK || "Grandmaster",
      clan: clan._id,
      avatarUrl: process.env.SEED_LEADER_AVATAR || "",
    });

    console.log("Database seeded successfully.");
    console.log("Seeded clan:", clan.clanName, clan._id.toString());
    console.log("Seeded leader account:");
    console.log("  username:", leader.username);
    console.log("  ingameName:", leader.ingameName);
    console.log("  role:", leader.role);
    console.log("  password (plain):", leaderPassword);

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
