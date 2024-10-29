// Adding data base from the PG
import pg from "pg";
const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "LibraryDataBase", //Your DB Name from pg admin
  password: "Pakistan@@@9823.", //Your DB Password.
  port: 5432,
});
export default db;
