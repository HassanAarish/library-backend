import mongoose from "mongoose";
// import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionUrl = process.env.MONGO_URI;

let connection;

const connectDB = async () => {
  try {
    mongoose.set("strictQuery", false);
    mongoose.set("strictPopulate", false);
    connection = await mongoose.connect(connectionUrl);
    console.log("🚀 ~ MongoDB connection SUCCESS");
  } catch (error) {
    console.error("🚀 ~ MongoDB connection FAIL");
    console.error(error);
    process.exit(1);
  }
};

// const pgdb = new pg.Client({
//   user: process.env.PG_ADMIN_USER,
//   host: process.env.PG_ADMIN_HOST,
//   database: process.env.PG_ADMIN_DATABASE, //Your DB Name from pg admin
//   password: process.env.PG_ADMIN_PASSWORD, //Your DB Password.
//   port: process.env.PG_ADMIN_PORT,
// });

// pgdb
//   .connect()
//   .then(() => console.log("🚀 ~ Connected to PostgreSQL database"))
//   .catch((err) => console.error("🚀 ~ Connection error", err.stack));

// // To run a query, you can use pgdb.query() like this:
// pgdb.query("SELECT * FROM your_table_name", (err, res) => {
//   if (err) {
//     console.error("🚀 ~ PostgresDB connection FAIL: ", err);
//   } else {
//     console.log("🚀 ~ PostgresDB connection SUCCESS", res.rows);
//   }
//   pgdb.end();
// });

// export { pgdb };

export { connectDB, connection };
