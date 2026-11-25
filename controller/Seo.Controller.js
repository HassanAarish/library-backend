import asyncHandler from "../middlewares/asyncHandler.js";
import * as seoService from "../services/Seo.Service.js";

export const getSitemap = asyncHandler(async (req, res) => {
  const xml = await seoService.buildSitemap();

  // Crawlers fetch it rarely; an hour of caching keeps it cheap.
  res.set("Cache-Control", "public, max-age=3600");
  return res.status(200).type("application/xml").send(xml);
});
