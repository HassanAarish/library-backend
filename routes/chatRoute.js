import express from "express";
import {
  getInbox,
  getSingleChat,
  initiateChat,
  sendMessage,
  updateChatMessageStatus,
} from "../controller/ChatController.js";
import verifyToken from "../middlewares/verifyToken.js";
import { cloudinaryUpload, multerHandler } from "../middlewares/multer.js";

const router = express.Router();

router.get("/inbox", verifyToken, getInbox);

router.post("/create-chat", verifyToken, initiateChat);

router.get("/single-chat/:chatId/messages", verifyToken, getSingleChat);

router.post(
  "/send-message",
  verifyToken,
  multerHandler,
  cloudinaryUpload,
  sendMessage
);

router.post("/update-message", verifyToken, updateChatMessageStatus);

export default router;
