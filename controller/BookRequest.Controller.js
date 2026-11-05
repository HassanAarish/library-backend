import asyncHandler from "../middlewares/asyncHandler.js";
import * as bookRequestService from "../services/BookRequest.Service.js";

export const createRequest = asyncHandler(async (req, res) => {
  const data = await bookRequestService.createRequest(req.body, req.userID, req.transaction);

  if (data.alreadyInLibrary) {
    return res.status(200).json({
      success: true,
      message: "Good news: this book is already in the library.",
      data, // { alreadyInLibrary: { _id, title, author, coverImage } }
    });
  }

  const message = !data.joined
    ? "Request sent. We'll email you when there's an update."
    : data.alreadyFollowing
      ? "You're already following this request."
      : "Someone already asked for this book, so we've added you to that request.";

  return res.status(data.joined ? 200 : 201).json({
    success: true,
    message,
    data, // { request, joined, alreadyFollowing? }
  });
});

export const followRequest = asyncHandler(async (req, res) => {
  const data = await bookRequestService.followRequest(
    req.params.requestId,
    req.userID,
    req.body?.note,
    req.transaction,
  );

  return res.status(200).json({
    success: true,
    message: data.alreadyFollowing
      ? "You're already following this request."
      : "You'll be notified when this book is added.",
    data,
  });
});

export const unfollowRequest = asyncHandler(async (req, res) => {
  const data = await bookRequestService.unfollowRequest(
    req.params.requestId,
    req.userID,
    req.transaction,
  );

  return res.status(200).json({
    success: true,
    message: "You're no longer following this request.",
    data,
  });
});

export const getCommunityRequests = asyncHandler(async (req, res) => {
  const data = await bookRequestService.getCommunityRequests(req, req.userID);

  return res.status(200).json({
    success: true,
    data,
  });
});

export const getRequest = asyncHandler(async (req, res) => {
  const data = await bookRequestService.getRequest(req.params.requestId, req.userID);

  return res.status(200).json({
    success: true,
    data,
  });
});

export const getMyRequests = asyncHandler(async (req, res) => {
  const data = await bookRequestService.getMyRequests(req);

  return res.status(200).json({
    success: true,
    data,
  });
});

// --- Admin

export const getAdminRequests = asyncHandler(async (req, res) => {
  const data = await bookRequestService.getAdminRequests(req);

  return res.status(200).json({
    success: true,
    data,
  });
});

export const getAdminRequest = asyncHandler(async (req, res) => {
  const data = await bookRequestService.getAdminRequest(req.params.requestId);

  return res.status(200).json({
    success: true,
    data,
  });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const data = await bookRequestService.updateStatus(
    req.params.requestId,
    req.body,
    req.transaction,
  );

  return res.status(200).json({
    success: true,
    message: "Request updated. Followers will be notified.",
    data,
  });
});

export const fulfillRequest = asyncHandler(async (req, res) => {
  const data = await bookRequestService.fulfillRequest(
    req.params.requestId,
    req.body,
    req.transaction,
  );

  return res.status(200).json({
    success: true,
    message: "Request fulfilled. Followers will be notified.",
    data,
  });
});

export const mergeRequest = asyncHandler(async (req, res) => {
  const data = await bookRequestService.mergeRequest(
    req.params.requestId,
    req.body?.intoId,
    req.transaction,
  );

  return res.status(200).json({
    success: true,
    message: "Requests merged.",
    data, // the request it was merged into
  });
});
