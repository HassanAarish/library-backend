import { MongoClient } from "mongodb";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

dotenv.config();
const uri =
  process.env.MONGO_URI ||
  "mongodb+srv://dd-dev:ammad567894@cluster0.akjudez.mongodb.net/VMS?retryWrites=true&w=majority&appName=Cluster0"; // Connection URI
const client = new MongoClient(uri);

// Function to export collection data to JSON file
async function exportCollection(collectionName) {
  try {
    await client.connect();
    const database = client.db("test");
    const collection = database.collection(collectionName);

    // Fetch all documents
    const data = await collection.find({}).toArray();

    // Define output file path
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const outputFile = path.join(__dirname, `${collectionName}_export.json`);

    // Write data to file
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
    console.log(
      `Collection '${collectionName}' exported successfully to ${outputFile}`
    );
  } catch (error) {
    console.error(`Error exporting collection '${collectionName}':`, error);
  } finally {
    await client.close();
  }
}

// Export data from the collection
exportCollection("subscriptions");
