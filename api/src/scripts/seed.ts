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

    // Create default clan
    const clan = await Clan.create({
      clanName: "BX Clan",
      description: "Clan Wild Rift hàng đầu Việt Nam.",
      bannerUrl:
        "https://cmsassets.rgpub.io/sanity/images/dsfx7636/news_live/3705653167ef8f43acdc03fb2f0a469d5b3086fd-1920x1080.jpg",
    });

    // Seed leader
    const leaderPassword = process.env.SEED_LEADER_PWD || "Leader@1234";
    const hashed = bcrypt.hashSync(leaderPassword, 10);

    // -------- FIX: dùng upsert + $setOnInsert --------
    await User.updateOne(
      { username: "leader" },
      {
        $setOnInsert: {
          username: "leader",
          password: hashed,
          ingameName: "BX_Leader",
          role: "leader",
          rank: "Grandmaster",
          clan: clan._id,
          avatarUrl:
            "https://res.cloudinary.com/dhlsylij1/image/upload/v1763431528/OIP_qg8ut8.webp",
        },
      },
      { upsert: true }
    );

    // Lấy leader document để log
    const leader = await User.findOne({ username: "leader" });

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
