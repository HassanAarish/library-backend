import asyncHandler from "../middlewares/asyncHandler.js";
import * as adminService from "../services/Admin.Service.js";
import helper from "../utils/helper.js";

export const getUserLists = asyncHandler(async (req, res) => {
  const result = await adminService.getUserLists(req);

  return res.status(200).json({
    success: true,
    data: result,
  });
});

export const getUserData = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  helper.checkMandatoryFields(req.params, ["userId"]);

  const data = await adminService.getUserData(userId);

  return res.status(200).json({
    success: true,
    message: "User data fetched successfully.",
    data,
  });
});

export const toggleUserBlock = asyncHandler(async (req, res) => {
  const session = req.transaction;
  const { userId } = req.params;
  const result = await adminService.toggleUserBlock(userId, session);

  return res.status(200).json({
    success: true,
    message: `User ${result.name} has been ${result.isBlocked ? "blocked" : "unblocked"} successfully.`,
    data: { isBlocked: result.isBlocked },
  });
});
