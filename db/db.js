// Adding data base from the PG
import pg from "pg";
const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "LibraryDataBase",
  password: "Pakistan@@@9823.",
  port: 5432,
});
export default db;
