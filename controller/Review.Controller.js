import asyncHandler from "../middlewares/asyncHandler.js";

export const createReview = asyncHandler(async (req, res) => {
  const { bookId } = req.params;
  await reviewService.createReview(
    bookId,
    req.userID,
    req.body,
    req.transaction
  );

  res.status(201).json({
    success: true,
    message: "Review submitted.",
  });
});
