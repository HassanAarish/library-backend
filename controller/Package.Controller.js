import asyncHandler from "../middlewares/asyncHandler.js";
import * as packageService from "../services/Package.Service.js";
import helper from "../utils/helper.js";

export const getPlans = asyncHandler(async (req, res) => {
  const data = await packageService.getActivePlans();

  return res.status(200).json({
    success: true,
    data,
  });
});

export const purchase = asyncHandler(async (req, res) => {
  helper.checkMandatoryFields(req.body, ["planId"]);

  const data = await packageService.purchase(
    req.body.planId,
    req.userID,
    req.body.method,
    req.transaction,
  );

  return res.status(201).json({
    success: true,
    message: "Package reserved. Complete the payment to activate your credits.",
    data, // { userPackage, payment: { _id, reference, amount, instructions } }
  });
});

export const cancelPurchase = asyncHandler(async (req, res) => {
  await packageService.cancelPurchase(req.params.userPackageId, req.userID, req.transaction);

  return res.status(200).json({
    success: true,
    message: "Package purchase cancelled.",
  });
});

export const getMyPackages = asyncHandler(async (req, res) => {
  const data = await packageService.getMyPackages(req.userID);

  return res.status(200).json({
    success: true,
    data, // { creditsAvailable, nextExpiry, packages }
  });
});

// --- Admin

export const getAllPlans = asyncHandler(async (req, res) => {
  const data = await packageService.getAllPlans();

  return res.status(200).json({
    success: true,
    data,
  });
});

export const createPlan = asyncHandler(async (req, res) => {
  helper.checkMandatoryFields(req.body, ["name", "credits", "price"]);

  const plan = await packageService.createPlan(req.body, req.transaction);

  return res.status(201).json({
    success: true,
    message: "Package plan created.",
    data: plan,
  });
});

export const updatePlan = asyncHandler(async (req, res) => {
  const plan = await packageService.updatePlan(req.params.planId, req.body, req.transaction);

  return res.status(200).json({
    success: true,
    message: "Package plan updated.",
    data: plan,
  });
});

export const getAdminPackages = asyncHandler(async (req, res) => {
  const data = await packageService.getAdminPackages(req);

  return res.status(200).json({
    success: true,
    data,
  });
});
