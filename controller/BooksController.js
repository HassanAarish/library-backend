import Book from "../models/Book.js";

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

export const addBook = async (req, res) => {
  const { title, category, author, price } = req.body;

  try {
    const book = await Book.create(req.body);
    res.status(200).json(book);
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
