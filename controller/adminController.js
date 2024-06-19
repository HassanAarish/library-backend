import Book from "../models/book.js";
import User from "../models/user.js";

export const addBook = async (req, res) => {
  const { title, category, author, price } = req.body;
  try {
    const user = await User.findById(req.userID);
    if (user.isAdmin === true) {
      const book = await Book.create(req.body);
      res.status(200).json({
        message: "Book added successfully !",
        book,
      });
    }
    res.status(403).json({ message: "User not Authorized" });
  } catch (error) {
    res.status(500).json({
      message: "Unable to add the book, Kindly re-enter the details !",
    });
  }
};

export const updateBook = async (req, res) => {
  const { title, id } = req.query;
  console.log(req.query);
  try {
    const user = await User.findById(req.userID);
    if (user.isAdmin === true) {
      // console.log(req.params);

      if (req.params) {
        const updatedBook = await Book.findByIdAndUpdate(req.params.id, {
          title: req.query.title,
        });
        console.log(updatedBook);
        res.status(200).json({ message: "Book updated successfully" });
      } else {
        res.status(400).json({ message: "Unable to update the book!" });
      }
    }
    res.status(400).json({ message: "User unauthorized to make changs!" });
  } catch (error) {
    res.status(500).json({
      message:
        "Wrong Book Selected for updating, kindly re-enter the book title! ",
    });
  }
};

export const deleteBook = async (req, res) => {
  const { title, id } = req.query;
  try {
    const user = await User.findById(req.userID);
    if (user.isAdmin === true) {
      const deletedBook = await Book.findByIdAndDelete(req.params.id);
      console.log(deletedBook);
      return res.status(200).json({ message: "Book deleted successfully" });
    }
    res.status(400).json({ message: "User unauthorized to make changs!" });
  } catch (error) {
    res.status(500).json({
      message:
        "Wrong Title entered for deleting, kindly re-enter the Book Title! ",
    });
  }
};

export const deleteAll = async (req, res) => {
  try {
    const user = await User.findById(req.userID);
    if (user.isAdmin === true) {
      const allBooks = await Book.find({});
      for (let i = 0; i < allBooks.length; i++) {
        console.log(`Deleted id: ${allBooks[i]._id}`);
        await Book.findByIdAndDelete(allBooks[i]._id);
      }
      res.status(200).json({ Success: true });
    }
  } catch (error) {
    res.status(500).json({
      message: "Unable to delete the books !",
    });
  }
};

export const getAllUserProfiles = async (req, res) => {
  const user = await User.findById(req.userID);
  if (user.isAdmin === true) {
    const user = await User.find({ isAdmin: false });
    res.status(200).json({
      success: true,
      users: user,
    });
  } else {
    res.status(403).json({ message: "User unauthorized for this request!" });
  }
};
