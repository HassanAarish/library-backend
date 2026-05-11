import mongoose from "mongoose";
import { getEnv } from "./dotenv.js";
// import pg from "pg";

export const connectDB = async () => {
  try {
    if (!getEnv("MONGO_URI")) {
      throw new Error("MONGO_URI is not set in environment variables");
    }

    await mongoose.connect(getEnv("MONGO_URI"));
    console.log("MongoDB Connected");
  } catch (err) {
    console.error("DB connection error:", err.message);
    process.exit(1);
  }
};

export default mongoose;

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
