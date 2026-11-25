import express from "express";
import * as seoController from "../controller/Seo.Controller.js";

const router = express.Router();

// Public: sitemap of the frontend's public pages and published books.
// The frontend's robots.txt points crawlers here.
router.get("/sitemap.xml", seoController.getSitemap);

export default router;
