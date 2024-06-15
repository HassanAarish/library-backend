import Book from "../models/book.js";
import User from "../models/user.js";
import verifyUserToken from "../middlewares/verifyUserToken.js";

export const addBook = async (req, res) => {
  const { title, category, author, price } = req.body;
  try {
    const book = await Book.create(req.body);
    res.status(200).json({
      message: "Book added successfully !",
      book,
    });
  } catch (error) {
    res.status(500).json({
      message: "Unable to add the book, Kindly re-enter the details !",
    });
  }
};

export const updateBook = async (req, res) => {
  try {
    const { title } = req.params;
    const book = await Book.findByTitleAndUpdate(title, req.body);

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }
    const updatedBook = await Book.findById(id);
    res.status(200).json(updatedBook);
  } catch (error) {
    res.status(500).json({
      message:
        "Wrong Book Selected for updating, kindly re-enter the book title! ",
    });
  }
};

export const deleteBook = async (req, res) => {
  try {
    const { title } = req.params;
    const book = await Book.findByIdAndDelete(title);
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }
    res.status(200).json({ message: "Book Deleted Successfully! " });
  } catch (error) {
    res.status(500).json({
      message:
        "Wrong Title entered for deleting, kindly re-enter the Book Title! ",
    });
  }
};

export const deleteAll = async (req, res) => {
  try {
    const allBooks = await Book.find({});
    for (let i = 0; i < allBooks.length; i++) {
      console.log(`Deleted id: ${allBooks[i]._id}`);
      await Book.findByIdAndDelete(allBooks[i]._id);
    }
    res.status(200).json({ Success: true });
  } catch (error) {
    res.status(500).json({
      message: "Unable to delete the books !",
    });
  }
};
