// import order from "../models/order.js";
import User from "../models/user.js";
import Book from "../models/Book.js";
import order from "../models/order.js";

export const createOrder = async (req, res) => {
  const { userId, bookId, startDate, endDate, price } = req.body;

  const user = await User.findById(userId);

  const book = await Book.findById(bookId);
  console.log(book);
  //   if (!user && !book && book.isRented === true) {
  //     return res.status(404).json({
  //       success: false,
  //       message: "Sorry we cannot process your order.",
  //     });
  //   }

  if (!user || !book || book.isRented === true) {
    return res.status(404).json({
      success: false,
      message: "Sorry we cannot process your order.",
    });
  }
  const newOrder = await order.create(req.body);

  book.isRented = true;
  await book.save();
  res.status(200).json({
    newOrder,
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

//     const orderId = await User.findById({});

//   try {
//     if (orderId === )
//   } catch (error) {

//   }
// };
