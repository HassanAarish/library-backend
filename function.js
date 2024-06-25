const books = [
  {
    _id: "667a936c8908380c84e47636",
    title: "Test Book",
    category: ["other", "other"],
    author: "Anonymous",
    price: 11,
    isRented: false,
    createdAt: "2024-06-25T09:52:44.641Z",
    updatedAt: "2024-06-25T09:52:44.641Z",
    __v: 0,
  },
  {
    _id: "666dd65c3a6ee2dc596bc697",
    title: "Never Loved: A Dark Obsession Novel",
    category: ["Contemporary romance", "New adult fiction"],
    author: "Charlotte von Stein",
    price: 50,
    isRented: false,
    createdAt: "2024-06-15T17:58:52.598Z",
    updatedAt: "2024-06-20T17:46:48.518Z",
    __v: 0,
  },
  {
    _id: "666b2d3a94d2fd7c79c4285a",
    title: "The Catcher in the Rye",
    category: ["Bildungsroman", "Realistic fiction"],
    author: "J.D. Salinger",
    price: 10,
    isRented: false,
    createdAt: "2024-06-13T17:32:42.479Z",
    updatedAt: "2024-06-20T17:36:11.792Z",
    __v: 0,
  },
  {
    _id: "666b2d3a94d2fd7c79c4285c",
    title: "The Hobbit",
    category: ["Fantasy", "Adventure"],
    author: "J.R.R. Tolkien",
    price: 10,
    isRented: false,
    createdAt: "2024-06-13T17:32:42.479Z",
    updatedAt: "2024-06-20T17:46:48.825Z",
    __v: 0,
  },
  {
    _id: "666b2d3a94d2fd7c79c4285b",
    title: "Harry Potter and the Sorcerer's Stone",
    category: ["Fantasy", "Young adult fiction"],
    author: "J.K. Rowling",
    price: 10,
    isRented: false,
    createdAt: "2024-06-13T17:32:42.479Z",
    updatedAt: "2024-06-20T17:36:12.107Z",
    __v: 0,
  },
  {
    _id: "666b2d3a94d2fd7c79c4285f",
    title: "Gone with the Wind",
    category: ["Historical fiction", "Romance"],
    author: "Margaret Mitchell",
    price: 10,
    isRented: false,
    createdAt: "2024-06-13T17:32:42.479Z",
    updatedAt: "2024-06-13T17:32:42.479Z",
    __v: 0,
  },
  {
    _id: "666b2d3a94d2fd7c79c4285d",
    title: "The Da Vinci Code",
    category: ["Mystery", "Thriller"],
    author: "Dan Brown",
    price: 10,
    isRented: false,
    createdAt: "2024-06-13T17:32:42.479Z",
    updatedAt: "2024-06-13T17:32:42.479Z",
    __v: 0,
  },
  {
    _id: "666b2d3a94d2fd7c79c4285e",
    title: "The Alchemist",
    category: ["Quest", "Philosophical fiction"],
    author: "Paulo Coelho",
    price: 10,
    isRented: false,
    createdAt: "2024-06-13T17:32:42.479Z",
    updatedAt: "2024-06-13T17:32:42.479Z",
    __v: 0,
  },
  {
    _id: "666b0a50adf1dd0187df5558",
    title: "The Great Gatsby  ",
    category: ["Tragedy", "Jazz Age fiction"],
    author: "F. Scott Fitzgerald",
    price: 10,
    isRented: false,
    createdAt: "2024-06-13T15:03:44.208Z",
    updatedAt: "2024-06-13T16:21:34.466Z",
    __v: 0,
  },
  {
    _id: "666b0a21adf1dd0187df5556",
    title: "Pride and Prejudice",
    category: ["Romance", "Classic literature"],
    author: "Jane Austen",
    price: 10,
    isRented: false,
    createdAt: "2024-06-13T15:02:57.590Z",
    updatedAt: "2024-06-13T15:02:57.590Z",
    __v: 0,
  },
  {
    _id: "666b09bbadf1dd0187df5553",
    title: "Pride and Prejudice",
    category: ["Romance", "Classic literature"],
    author: "Jane Austen",
    price: 5,
    isRented: false,
    createdAt: "2024-06-13T15:01:15.804Z",
    updatedAt: "2024-06-13T15:01:15.804Z",
    __v: 0,
  },
];

const searchBook = (search) => {
  console.log(search);
  const foundBook = books.filter((book) => {
    if (
      book.title === search ||
      book.category === search ||
      book.author === search
    ) {
      console.log(foundBook);
    }
  });
};
searchBook("Romance");
console.log(searchBook);

// if (foundBook.length > 0) {
//     return foundBook;
//   } else {
//     return res.status(400).jsno({ message: "Nothing found" });
//   }
