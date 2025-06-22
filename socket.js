import { Server } from "socket.io";
import { createServer } from "node:http";
import User from "./models/User.Model.js";
import Messages from "./models/Messages.Model.js";
import jwt from "jsonwebtoken";
import Notification from "./models/Notification.Model.js";

export let io;
export let usersio = {}; // Initialize the usersio object;
let onlineUsers = {};

const initializeSocket = (app) => {
  const server = createServer(app);
  io = new Server(server, {
    maxHttpBufferSize: 1e8, // 100MB
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Middleware for authentication
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    console.log("🚀 ~ token:", token);
    if (token) {
      jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
        if (err) {
          console.error("Authentication error:", err);
          return next(new Error("Authentication error"));
        }
        socket.userId = decoded.user.userID;
        usersio[decoded.user.userID] = socket.id;
        const user = await User.findById(decoded.user.userID);
        socket.user = user;
        // console.log("🚀 ~ user authenticated:", user);
        next();
      });
    } else {
      next(new Error("Authentication error"));
    }
  });

  // Connection handling
  io.on("connection", (socket) => {
    console.log("🚀 ~ usersio:", usersio);

    onlineUsers[socket.userId] = socket.id;
    io.emit("allOnlineUsers", onlineUsers);

    setTimeout(() => {
      io.emit("userOnlineStatus", { userId: socket.userId, status: "online" });
    }, 5000);

    console.log("🚀 ~ io.on ~ onlineUsers:", onlineUsers);

    socket.on(
      "sendMessage",
      async (userId, receiverId, chatId, message, callback) => {
        try {
          if (!message?.contentType || !message?.content) {
            return callback({
              error: "Error in sending message, provide valid fields",
            });
          }
          const userSocket = usersio[userId];
          const receiverSocket = usersio[receiverId];

          const newMessage = new Messages({
            chatId,
            senderId: userId,
            contentType: message.contentType,
            content: message.content,
            media: message.media,
          });

          let savedMessage = await newMessage.save();

          if (receiverSocket) {
            savedMessage.status = "delivered";
            await savedMessage.save();
            io.to(receiverSocket).emit("newMessage", savedMessage);
          }

          if (userSocket) {
            console.log("🚀 ~ savedMessage:", savedMessage);
            io.to(userSocket).emit("newMessage", savedMessage);
          }

          console.log("🚀 ~ Message sent");
          callback({ success: true });
        } catch (error) {
          console.error("🚀 ~ Error sending message:", error);
          callback({ error: "Error in sending message" });
        }
      }
    );

    socket.on("allMessageRead", async (chatId) => {
      console.log("🚀 ~ socket.on ~ chatId:", chatId);
      const messages = await Messages.find({
        chatId,
        status: { $in: ["sent", "delivered"] },
      });
      if (messages.length) {
        messages.map(async (message) => {
          message.status = "seen";
          await message.save();
        });
      }
    });

    socket.on("messageRead", async (messageId, callback) => {
      try {
        const updatedMessage = await Messages.findByIdAndUpdate(messageId, {
          status: "seen",
        });
        console.log("🚀 ~ socket.on ~ updatedMessage:", updatedMessage);
        callback({ success: true, message: updatedMessage });
      } catch (error) {
        callback({ success: false });
      }
    });

    socket.on("createNotification", async (notificationData, callback) => {
      const { senderId, recipientId, type, message, additionalData } =
        notificationData;

      try {
        if (!senderId || !recipientId || !type || !message) {
          return callback({
            success: false,
            error:
              "All fields (senderId, recipientId, type, message) are required.",
          });
        }

        const validTypes = [
          "BookingRequest",
          "BookingStatusUpdate",
          "Message",
          "Review",
          "SystemAlert",
          "QuoteUpdate",
          "ServiceApproval",
        ];

        if (!validTypes.includes(type)) {
          return callback({
            success: false,
            error: `Invalid notification type. Valid types are: ${validTypes.join(
              ", "
            )}`,
          });
        }

        const sender = await User.findById(senderId);
        const recipient = await User.findById(recipientId);

        if (!sender || !recipient) {
          return callback({
            success: false,
            error: "Invalid sender or recipient ID.",
          });
        }

        const newNotification = new Notification({
          sender: senderId,
          recipient: recipientId,
          type,
          message,
          additionalData,
        });

        const savedNotification = await newNotification.save();

        const recipientSocket = usersio[recipientId];
        if (recipientSocket) {
          io.to(recipientSocket).emit("receiveNotification", {
            ...savedNotification.toObject(),
            sender,
          });
        }

        callback({
          success: true,
          message: "Notification created and sent successfully",
          data: savedNotification,
        });
      } catch (error) {
        console.error("Error creating notification:", error);

        callback({
          success: false,
          error: "Error in creating notification",
        });
      }
    });

    socket.on("disconnect", () => {
      console.log("🚀 ~ disconnected:", socket.id);
      delete onlineUsers[socket.userId];
      io.emit("userOnlineStatus", { userId: socket.userId, status: "offline" });
      if (socket.userId) {
        delete usersio[socket.userId];
      }
    });
  });

  const port = process.env.PORT || 5000;
  server.listen(port, () => {
    console.log(`🚀 ~ Socket server running on port ${port}`);
  });

  return io;
};

export { initializeSocket };
