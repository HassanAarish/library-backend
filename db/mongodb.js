// Adding data base from the PG
// import pg from "pg";
// const db = new pg.Client({
//   user: "postgres",
//   host: "localhost",
//   database: "LibraryDataBase", Your DB Name from pg admin
//   password: "Pakistan@@@9823.", Your DB Password.
//   port: 5432,
// });
// export default db;

// Adding Data base from Mongo DB
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectionUrl = process.env.MONGO_URI;
console.log(connectionUrl);

const connectDB = async () => {
  try {
    mongoose.set("strictQuery", false);
    await mongoose.connect(connectionUrl);
    console.log("MongoDB connection SUCCESSFULL");
  } catch (error) {
    console.error("MongoDB connection FAIL");
    console.error(error);
    process.exit(1);
  }
};

export default connectDB;
