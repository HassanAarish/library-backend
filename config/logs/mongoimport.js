import { MongoClient } from "mongodb";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

dotenv.config();
const uri =
  // process.env.MONGO_URI ||
  "mongodb+srv://admin:admin@backenddb.afxoz7w.mongodb.net/?retryWrites=true&w=majority&appName=BackendDB"; // Connection URI
const client = new MongoClient(uri);

// Function to import JSON file data into a collection
async function importCollection(collectionName, filePath) {
  try {
    await client.connect();
    const database = client.db("test");
    const collection = database.collection(collectionName);

    // Read data from JSON file
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

    // Insert data into the collection
    const result = await collection.insertMany(data);

    console.log(
      `Imported ${result.insertedCount} documents into collection '${collectionName}'`
    );
  } catch (error) {
    console.error(
      `Error importing data into collection '${collectionName}':`,
      error
    );
  } finally {
    await client.close();
  }
}

// Define the JSON file path and collection name
const collectionName = "subscriptions"; // Change as needed
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const inputFile = path.join(__dirname, `${collectionName}_export.json`);

// Import data into the specified collection
importCollection(collectionName, inputFile);
