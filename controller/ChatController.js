import asyncHandler from "../middlewares/asyncHandler.js";
import Chat from "../models/Chat.Model.js";
import Messages from "../models/Messages.Model.js";
import { io, usersio } from "../socket.js";
import ErrorResponse from "../utils/errorResponse.js";

export const getInbox = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.userID;

    const inboxes = await Chat.find({
      $or: [{ user1: userId }, { user2: userId }],
    }).populate({
      path: "user1 user2",
      select: "profilePicture firstName lastName",
    });

    // Check if no inboxes found
    if (!inboxes.length) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    // Map over inboxes and prepare filtered data
    const filteredInboxes = inboxes.map((chat) => {
      const otherUser =
        chat.user1._id.toString() === userId.toString()
          ? chat.user2
          : chat.user1;

      const { user1, user2, ...chatWithoutUsers } = chat.toObject();
      return {
        ...chatWithoutUsers,
        user: otherUser, // Add "user" field with the other user's data
      };
    });

    // Retrieve the latest message and unseen count for each inbox
    const completeInboxes = await Promise.all(
      filteredInboxes.map(async (element) => {
        const latestMessage = await Messages.findOne(
          { chatId: element._id },
          "content createdAt contentType"
        ).sort({
          createdAt: -1,
        });

        const unseenCount = await Messages.countDocuments({
          chatId: element._id,
          status: { $ne: "seen" },
          senderId: { $ne: userId },
        });

        return {
          chat: element,
          latestMessage: latestMessage || null,
          unseenCount: unseenCount || 0,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: completeInboxes,
    });
  } catch (error) {
    console.error("Error in getInbox:", error);
    return next(error);
  }
});

export const initiateChat = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.userID;
    const { user2Id, content } = req.body;
    console.log("🚀 ~ initiateChat ~  req.body:", req.body);
    console.log("🚀 ~ initiateChat ~ userId:", userId);

    const existChat = await Chat.findOne({
      $or: [
        { user1: userId, user2: user2Id },
        { user1: user2Id, user2: userId },
      ],
    });

    if (existChat) {
      const message = await Messages.create({
        chatId: existChat._id,
        contentType: "text",
        content: content,
        senderId: userId,
      });
      return res.status(201).json({
        success: true,
        data: message,
      });
    }
    console.log("🚀 ~ initiateChat ~ existChat:", existChat);

    const chat = await Chat.create({
      user1: userId,
      user2: user2Id,
    });
    if (chat) {
      const message = await Messages.create({
        chatId: chat._id,
        contentType: "text",
        content: content,
        senderId: userId,
      });
      return res.status(201).json({
        success: true,
        data: message,
      });
    } else {
      return next(new ErrorResponse("Chat is not create", 404));
    }
  } catch (error) {
    return next(error);
  }
});

export const getSingleChat = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.userID;
    const { limit = 20, page = 1 } = req.query;
    const { chatId } = req.params;

    // Find the chat by its ID
    const chat = await Chat.findById(chatId).populate(
      "user1 user2",
      "profilePicture firstName lastName"
    );

    if (!chat) {
      return next(new ErrorResponse("Chat not found", 404));
    }

    // Determine the other user in the chat
    const otherUser =
      chat.user1._id.toString() === userId.toString() ? chat.user2 : chat.user1;

    const filteredChat = {
      _id: chat._id,
      user: {
        _id: otherUser._id,
        profilePicture: otherUser.profilePicture,
        firstName: otherUser.firstName,
        lastName: otherUser.lastName,
      },
    };

    // Calculate the skip value for pagination
    const skip = (page - 1) * limit;

    // Fetch messages for this chat with pagination
    const messages = await Messages.find({ chatId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const orderedMessages = messages.reverse();

    return res.status(200).json({
      success: true,
      data: {
        filteredChat,
        messages: orderedMessages,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export const sendMessage = asyncHandler(async (req, res, next) => {
  const { chatId, contentType, content } = req.body;
  const senderId = req.userID;
  console.log(
    "🚀 ~ sendMessage ~ chatId, contentType, content:",
    chatId,
    contentType,
    content,
    senderId
  );
  // Validate required fields
  if (!chatId || !senderId || !contentType) {
    return next(
      new ErrorResponse("chatId, senderId, and contentType are required.", 400)
    );
  }

  try {
    const media = req.cloudinaryUploads || [];

    let messageContent = "";
    let messageMedia = [];

    if (contentType === "text") {
      if (!content) {
        return next(
          new ErrorResponse("Text content is required for text messages.", 400)
        );
      }
      messageContent = content;
    } else if (contentType === "audio") {
      // Audio message
      if (media.length === 0) {
        return next(new ErrorResponse("No audio files uploaded.", 400));
      }
      messageMedia = media;
    } else {
      if (media.length === 0) {
        return next(new ErrorResponse("No media files uploaded.", 400));
      }
      messageMedia = media;
    }

    if (!messageContent && messageMedia.length === 0) {
      return next(new ErrorResponse("No content or media to send.", 400));
    }

    const message = new Messages({
      chatId,
      senderId,
      contentType,
      content: messageContent,
      media: messageMedia,
      status: "sent",
    });

    await message.save();

    let reciever = await Chat.findById(chatId).populate("user1 user2", "_id");
    let senderSocket = usersio[reciever.user2._id];
    let recieverSocket = usersio[reciever.user1._id];
    if (senderSocket) {
      io.to(senderSocket).emit("newMessage", message);
    }
    if (recieverSocket) {
      io.to(recieverSocket).emit("newMessage", message);
    }

    return res.status(200).json({
      success: true,
      message: "Message sent successfully",
      data: message,
    });
  } catch (error) {
    return next(error);
  }
});

export const updateChatMessageStatus = asyncHandler(async (req, res, next) => {
  try {
    const { chatId } = req.body;
    const currentUserId = req.userID; // Assuming req.user contains the authenticated user's details

    console.log("🚀 ~ updateChatMessageStatus ~ chatId:", chatId);

    // Find messages for the given chatId sent by other users that are not yet "seen"
    const messages = await Messages.find({
      chatId,
      senderId: { $ne: currentUserId }, // Exclude messages sent by the current user
      status: { $in: ["sent", "delivered"] },
    });

    if (messages.length) {
      await Promise.all(
        messages.map(async (message) => {
          message.status = "seen";
          await message.save();
        })
      );
    }

    return res.status(200).json({
      success: true,
      message: "Message Status Updated Successfully",
      data: messages,
    });
  } catch (error) {
    return next(error);
  }
});
