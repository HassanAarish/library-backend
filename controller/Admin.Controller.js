import asyncHandler from "../middlewares/asyncHandler.js";
import * as adminService from "../services/Admin.Service.js";
import helper from "../utils/helper.js";

/**
 * What address the server sees for the caller, and the raw proxy headers, so the
 * admin can check that readers' real addresses are used on the live host.
 * Only the caller's own request is shown.
 */
export const ipCheck = (req, res) =>
  res.status(200).json({
    success: true,
    data: {
      ip: req.ip,
      remoteAddress: req.socket.remoteAddress,
      forwardedFor: req.get("x-forwarded-for") ?? null,
      cfConnectingIp: req.get("cf-connecting-ip") ?? null,
      viaCloudflare: Boolean(req.get("cf-ray")),
    },
  });

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

export const getDashboardStats = asyncHandler(async (req, res) => {
  const data = await adminService.getDashboardStats();

  return res.status(200).json({
    success: true,
    data,
  });
});

export const getAuditLogs = asyncHandler(async (req, res) => {
  const data = await adminService.getAuditLogs(req);

  return res.status(200).json({
    success: true,
    data,
  });
});

export const getRequestLogs = asyncHandler(async (req, res) => {
  const data = await adminService.getRequestLogs(req);

  return res.status(200).json({
    success: true,
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
