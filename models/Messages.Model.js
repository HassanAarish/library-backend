import mongoose from "mongoose";

const MessagesSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    contentType: {
      type: String,
      enum: ["text", "image", "video", "audio", "file"],
    },
    content: {
      type: String,
    },
    media: [
      {
        publicId: {
          type: String,
        },
        url: {
          type: String,
        },
        name: {
          type: String,
        },
      },
    ],
    isSeen: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],
      default: "sent",
    },
  },
  {
    timestamps: true,
  }
);

const Messages = mongoose.model("Messages", MessagesSchema);

export default Messages;
