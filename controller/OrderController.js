// import order from "../models/order.js";
import User from "../models/user.js";
import Book from "../models/book.js";
import order from "../models/order.js";

export const createOrder = async (req, res) => {
  const { rentedBooks } = req.body;

  for (let i = 0; i < rentedBooks.length; i++) {
    const book = await Book.findById(rentedBooks[i].bookId);

    if (!book || book.isRented === false) {
      // Ensure book is found before updating
      book.isRented = true;
      await book.save();
    } else {
      return res.status(400).json({ message: "Book is not available" });
      // Handle the case where the book with the given id is not found
      // Maybe throw an error or log the issue for further investigation
    }
  }
  const newOrder = await order.create(req.body);

  const foundOrder = await order
    .findById(newOrder._id)
    .populate("rentedBooks.bookId");
  res.status(200).json({
    foundOrder,
    success: true,
    message: "Your order have been placed successfully !",
  });
};

export const getUserOrders = async (req, res) => {
  try {
    const user = await User.findById(req.body.userid);
    if (!user) {
      res.status(404).json({ message: "User not foun" });
    }
    const foundOrders = await order.find({
      userId: user._id,
    });
    if (foundOrders.length > 0) {
      res.status(200).json(foundOrders);
    }
    res.status(404).json({ message: "No orders found" });
  } catch (error) {
    res.status(404).json({ message: "No orders found", error: error });
  }
};
