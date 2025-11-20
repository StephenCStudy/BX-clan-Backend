import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import Clan from "../models/Clan.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const clan = await Clan.findOne();
    res.json(clan);
  } catch (err) {
    next(err);
  }
});

router.put("/", requireAuth, requireRoles("leader"), async (req, res, next) => {
  try {
    const { clanName, description, requirements, bannerUrl } = req.body;
    const clan = await Clan.findOneAndUpdate(
      {},
      { clanName, description, requirements, bannerUrl },
      { new: true, upsert: true }
    );
    res.json(clan);
  } catch (err) {
    next(err);
  }
});

export default router;
