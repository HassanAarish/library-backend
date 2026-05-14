import asyncHandler from "../middlewares/asyncHandler.js";
import * as rentalService from "../services/Rental.Service.js";
import helper from "../utils/helper.js";

export const createRentalBooking = asyncHandler(async (req, res) => {
  const session = req.transaction;

  const body = { ...req.body, renterId: req.userID };

  helper.checkMandatoryFields(body, ["bookId", "expiryDate", "renterId"]);

  await rentalService.createRentalBooking(body, session);

  return res.status(201).json({
    success: true,
    message: "Book rented successfully.",
  });
});
