import express from "express";
import { Passport } from "passport";

const router = express.Router();

// Google Authentication Routes
router.get(
  "/auth/google",
  Passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/auth/google/callback",
  Passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    // Successful authentication
    res.redirect("/dashboard"); // Or send token if using SPA
  }
);

// Facebook Authentication Routes
router.get(
  "/auth/facebook",
  Passport.authenticate("facebook", { scope: ["email"] })
);

router.get(
  "/auth/facebook/callback",
  Passport.authenticate("facebook", { failureRedirect: "/" }),
  (req, res) => {
    // Successful authentication
    res.redirect("/dashboard"); // Or send token if using SPA
  }
);
export default router;
