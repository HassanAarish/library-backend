import asyncHandler from "../middlewares/asyncHandler.js";
import * as rentalService from "../services/Rental.Service.js";
import helper from "../utils/helper.js";

export const getAvailability = asyncHandler(async (req, res) => {
  const data = await rentalService.getAvailability(req.params.bookId, req.userID);

  return res.status(200).json({
    success: true,
    data,
  });
});

export const createRental = asyncHandler(async (req, res) => {
  helper.checkMandatoryFields(req.body, ["bookId"]);

  const { rental, payment } = await rentalService.createRental(
    req.body,
    req.userID,
    req.transaction,
  );

  const message = payment
    ? "Slot reserved. Complete the payment to confirm your rental."
    : rental.status === "active"
      ? "Rental confirmed. Happy reading!"
      : "Booking confirmed.";

  return res.status(201).json({
    success: true,
    message,
    data: {
      rental: {
        _id: rental._id,
        status: rental.status,
        startDate: rental.startDate,
        endDate: rental.endDate,
        paymentMethod: rental.paymentMethod,
        price: rental.price,
        holdExpiresAt: rental.holdExpiresAt,
      },
      payment, // null for credit/free rentals; otherwise { _id, reference, amount, instructions }
    },
  });
});

export const getMyRentals = asyncHandler(async (req, res) => {
  const data = await rentalService.getMyRentals(req, req.userID);

  return res.status(200).json({
    success: true,
    data,
  });
});

export const getMyRental = asyncHandler(async (req, res) => {
  const data = await rentalService.getMyRental(req.params.rentalId, req.userID);

  return res.status(200).json({
    success: true,
    data,
  });
});

export const cancelRental = asyncHandler(async (req, res) => {
  const result = await rentalService.cancelRental(req.params.rentalId, req.userID, req.transaction);

  const notes = [
    result.creditReturned && "Your package credit has been returned.",
    result.refundRequested && "Your refund request has been sent to our team.",
  ].filter(Boolean);

  return res.status(200).json({
    success: true,
    message: ["Booking cancelled.", ...notes].join(" "),
    data: result,
  });
});

export const extendRental = asyncHandler(async (req, res) => {
  const rental = await rentalService.extendRental(req.params.rentalId, req.userID, req.transaction);

  return res.status(200).json({
    success: true,
    message: "Rental extended.",
    data: { endDate: rental.endDate },
  });
});

export const returnRental = asyncHandler(async (req, res) => {
  await rentalService.returnRental(req.params.rentalId, req.userID, req.transaction);

  return res.status(200).json({
    success: true,
    message: "Book returned. Thanks for reading!",
  });
});

export const startRentalNow = asyncHandler(async (req, res) => {
  const rental = await rentalService.startRentalNow(
    req.params.rentalId,
    req.userID,
    req.transaction,
  );

  return res.status(200).json({
    success: true,
    message: "Your rental has started.",
    data: { startDate: rental.startDate, endDate: rental.endDate },
  });
});

export const getAdminRentals = asyncHandler(async (req, res) => {
  const data = await rentalService.getAdminRentals(req);

  return res.status(200).json({
    success: true,
    data,
  });
});
