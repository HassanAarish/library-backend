import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const db = new pg.Client({
  user: process.env.PG_ADMIN_USER,
  host: process.env.PG_ADMIN_HOST,
  database: process.env.PG_ADMIN_DATABASE, //Your DB Name from pg admin
  password: process.env.PG_ADMIN_PASSWORD, //Your DB Password.
  port: process.env.PG_ADMIN_PORT,
});
export default db;
