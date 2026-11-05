import mongoose from "mongoose";
import { getEnv } from "./dotenv.js";

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
