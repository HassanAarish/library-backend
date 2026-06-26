import asyncHandler from "../middlewares/asyncHandler.js";
import * as commonService from "../services/Common.Service.js";

export const upload = asyncHandler(async (req, res, next) => {
  const results = await commonService.uploadFiles(req.files);

  req.cloudinaryCleanupQueue = results.map((file) => file.public_id);

  res.status(200).json({
    success: true,
    message: "Files uploaded successfully",
    data: results, // Array of { name, url, public_id }
  });
});

// Remove one or more uploaded assets from Cloudinary.
// Body: { public_id: "..." } or { publicIds: ["...", "..."] }
export const remove = asyncHandler(async (req, res) => {
  const { publicIds, public_id } = req.body;

  const results = await commonService.removeFiles(publicIds ?? public_id);

  res.status(200).json({
    success: true,
    message: "Files removed successfully",
    data: results, // Array of { public_id, result }
  });
});
