const User = require("../models/userCreate");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const extractToken = (socket) => {
  const authToken = socket.handshake?.auth?.token;
  if (authToken && typeof authToken === "string") {
    return authToken.startsWith("Bearer ")
      ? authToken.split(" ")[1].trim()
      : authToken.trim();
  }

  const headerToken = socket.handshake?.headers?.authorization;
  if (headerToken && typeof headerToken === "string") {
    return headerToken.startsWith("Bearer ")
      ? headerToken.split(" ")[1].trim()
      : headerToken.trim();
  }

  return null;
};

const extractLegacyAuthUserId = (socket) => {
  const authUserId = socket.handshake?.auth?.userId;
  if (authUserId && typeof authUserId === "string") {
    return authUserId.trim();
  }

  const queryUserId = socket.handshake?.query?.userId;
  if (queryUserId && typeof queryUserId === "string") {
    return queryUserId.trim();
  }

  return null;
};

const userSocket = (io) => {
  // Store userId -> socket.id mapping for direct communication
  const users = {};

  io.on("connection", async (socket) => {
    let authUserId = null;
    const token = extractToken(socket);

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        authUserId = decoded?.user?.id;
        if (!authUserId) {
          throw new Error("Invalid token payload");
        }
      } catch (err) {
        console.log("Invalid socket token");
        socket.emit("socket-error", { message: "Invalid token" });
        socket.disconnect(true);
        return;
      }
    } else {
      authUserId = extractLegacyAuthUserId(socket);
      if (!authUserId) {
        console.log("No socket token or userId provided");
        socket.emit("socket-error", {
          message: "Unauthorized socket connection",
        });
        socket.disconnect(true);
        return;
      }
      console.log("Socket connected with legacy userId handshake");
    }

    if (!mongoose.Types.ObjectId.isValid(authUserId)) {
      socket.emit("socket-error", { message: "Invalid user id" });
      socket.disconnect(true);
      return;
    }

    let user = null;
    try {
      user = await User.findOneAndUpdate(
        { userId: authUserId },
        { isOnline: true },
        { new: true }
      );
      if (user) {
        console.log("User set online:", user.userName);
      } else {
        console.log("User not found for auth user id:", authUserId);
      }
    } catch (err) {
      console.error("Error updating user online status:", err);
    }

    const authUserRoom = authUserId.toString();

    socket.join(authUserRoom);
    if (user?._id) {
      socket.join(user._id.toString());
    }
    const activeAuthRoom = io.sockets.adapter.rooms.get(authUserRoom);
    if (activeAuthRoom && activeAuthRoom.size === 1) {
      io.emit("user-online", authUserRoom);
    }

    // 📱 Register user for direct socket communication
    socket.on("register", (userId) => {
      users[userId] = socket.id;
      console.log(`User ${userId} registered with socket ${socket.id}`);
    });

    // 📞 Call initiated
    socket.on("call:initiate", ({ callerId, callerName, receiverId, roomName }) => {
      const receiverSocket = users[receiverId];

      if (receiverSocket) {
        io.to(receiverSocket).emit("call:incoming", {
          callerId,
          callerName,
          roomName,
        });
        console.log(`Call initiated from ${callerId} to ${receiverId}`);
      } else {
        console.log(`Receiver ${receiverId} not found for call from ${callerId}`);
        socket.emit("call:error", { message: "Receiver not available" });
      }
    });

    // ✅ Call accepted
    socket.on("call:accept", ({ callerId, roomName }) => {
      const callerSocket = users[callerId];

      if (callerSocket) {
        io.to(callerSocket).emit("call:accepted", {
          roomName,
        });
        console.log(`Call accepted from ${authUserId.toString()} to ${callerId}`);
      } else {
        console.log(`Caller ${callerId} not found`);
        socket.emit("call:error", { message: "Caller not available" });
      }
    });

    // ❌ Call rejected
    socket.on("call:reject", ({ callerId }) => {
      const callerSocket = users[callerId];

      if (callerSocket) {
        io.to(callerSocket).emit("call:rejected");
        console.log(`Call rejected from ${authUserId.toString()} to ${callerId}`);
      } else {
        console.log(`Caller ${callerId} not found`);
      }
    });

    socket.on("check-user-status", async (id) => {
      const online = io.sockets.adapter.rooms.has(id) ? true : false;
      socket.emit("user-status", { id, online });
    });

    socket.on("chat:typing", async ({ toUserAuthId, conversationId }) => {
      if (!toUserAuthId) return;
      io.to(toUserAuthId).emit("chat:typing", {
        fromUserAuthId: authUserId.toString(),
        conversationId,
      });
    });

    socket.on("chat:stop-typing", async ({ toUserAuthId, conversationId }) => {
      if (!toUserAuthId) return;
      io.to(toUserAuthId).emit("chat:stop-typing", {
        fromUserAuthId: authUserId.toString(),
        conversationId,
      });
    });

    socket.on("disconnect", async () => {
      // Clean up user mapping on disconnect
      Object.keys(users).forEach((userId) => {
        if (users[userId] === socket.id) {
          delete users[userId];
          console.log(`User ${userId} unregistered from socket mapping`);
        }
      });

      const activeRoomAfterDisconnect = io.sockets.adapter.rooms.get(authUserRoom);
      const hasOtherActiveConnections =
        !!activeRoomAfterDisconnect && activeRoomAfterDisconnect.size > 0;

      if (hasOtherActiveConnections) {
        return;
      }

      try {
        const user = await User.findOneAndUpdate(
          { userId: authUserId },
          { isOnline: false, lastSeen: new Date() },
          { new: true }
        );
        if (user) {
          console.log("User set offline:", user.userName);
        }
      } catch (err) {
        console.error("Error updating lastSeen on disconnect:", err);
      }

      io.emit("user-offline", authUserRoom);
    });
  });
};

module.exports = userSocket;
