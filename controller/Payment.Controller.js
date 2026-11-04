import asyncHandler from "../middlewares/asyncHandler.js";
import * as paymentService from "../services/Payment.Service.js";
import { uploadPaymentProof } from "../services/Common.Service.js";
import { listProviders } from "../services/payments/providers.js";
import helper from "../utils/helper.js";

export const getMethods = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    data: listProviders(),
  });
});

export const uploadProof = asyncHandler(async (req, res) => {
  const data = await uploadPaymentProof(req.file, req.userID);

  return res.status(200).json({
    success: true,
    message: "Screenshot uploaded.",
    data, // { public_id, name } — send as `screenshot` with the proof
  });
});

export const submitProof = asyncHandler(async (req, res) => {
  helper.checkMandatoryFields(req.body, ["transactionId", "senderNumber", "screenshot"]);

  await paymentService.submitProof(req.params.paymentId, req.userID, req.body, req.transaction);

  return res.status(200).json({
    success: true,
    message: "Thanks! We're checking your payment and will confirm it shortly.",
  });
});

export const getMyPayments = asyncHandler(async (req, res) => {
  const data = await paymentService.getMyPayments(req, req.userID);

  return res.status(200).json({
    success: true,
    data,
  });
});

export const getMyPayment = asyncHandler(async (req, res) => {
  const data = await paymentService.getMyPayment(req.params.paymentId, req.userID);

  return res.status(200).json({
    success: true,
    data,
  });
});

// --- Admin

export const getAdminPayments = asyncHandler(async (req, res) => {
  const data = await paymentService.getAdminPayments(req);

  return res.status(200).json({
    success: true,
    data,
  });
});

export const approvePayment = asyncHandler(async (req, res) => {
  await paymentService.approvePayment(req.params.paymentId, req.userID, req.transaction);

  return res.status(200).json({
    success: true,
    message: "Payment approved.",
  });
});

export const rejectPayment = asyncHandler(async (req, res) => {
  helper.checkMandatoryFields(req.body, ["reason"]);

  await paymentService.rejectPayment(
    req.params.paymentId,
    req.userID,
    req.body.reason,
    req.transaction,
  );

  return res.status(200).json({
    success: true,
    message: "Payment rejected.",
  });
});

export const resolveRefund = asyncHandler(async (req, res) => {
  helper.checkMandatoryFields(req.body, ["status"]);

  await paymentService.resolveRefund(req.params.paymentId, req.body, req.transaction);

  return res.status(200).json({
    success: true,
    message: `Refund marked as ${req.body.status}.`,
  });
});
