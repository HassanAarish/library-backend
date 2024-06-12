// Adding books to the data base

import mongoose from "mongoose";

const BooksSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please enter the book title: "],
    },
    category: {
      type: String,
      required: true,
      default: "Anonymous",
    },
    author: {
      type: String,
      required: true,
      default: "Anonymous",
    },
    price: {
      type: Number,
      required: [true, "Please enter the books price: "],
      default: 0,
    },
  },
  {
    timestamp: true,
  }
);

const Book = mongoose.model("Books", BooksSchema);
export default Book;
