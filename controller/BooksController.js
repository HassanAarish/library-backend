import Book from "../models/book.js";

export const getAllbooks = async (req, res) => {
  try {
    const books = await Book.find({
      isRented: false,
    }).sort({
      createdAt: -1,
    });
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({
      message: "Unable to find the book, please re-enter the book title !",
    });
  }
};

export const getByCategory = async (req, res) => {
  try {
    const category = req.params["category"];
    console.log("Category: ", category);

    const books = await Book.find({ category });
    console.log("books: ", books);
    if (books.length === 0) {
      console.log("No books found for your category: ", category);
      return res.status(301).send({
        message: "Nothing found",
      });
    }
    res.status(200).send(books);
  } catch (error) {
    console.log(error);
  }
};