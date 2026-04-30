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
        console.log(authUserId, "connected with socket token");
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
        { new: true },
      );
      if (user) {
         console.log(user,"User found for socket connection");
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

    // � Call initiated - Forward to receiver
   socket.on("call:initiate", (data) => {
  const receiverRoom = data.receiverId.toString();

  const room = io.sockets.adapter.rooms.get(receiverRoom);

  console.log("📡 Trying to call:", receiverRoom);
  console.log("📡 Available rooms:", io.sockets.adapter.rooms);

  if (room && room.size > 0) {
    io.to(receiverRoom).emit("call:incoming", {
      callerId: data.callerId,
      callerName: data.callerName,
      roomName: data.roomName,
    });

    console.log("✅ Call delivered to", receiverRoom);
  } else {
    console.log("❌ Receiver not connected:", receiverRoom);

    socket.emit("call:error", {
      message: "User not available to take call",
    });
  }
});

    // ✅ Call accepted - Send to caller and receiver
    socket.on("call:accept", async (data) => {
      try {
        // Get current user's info (the receiver accepting the call)
        const currentUser = await User.findOne({ userId: authUserId });

        // Send acceptance to caller
        io.to(data.callerId).emit("call:accepted", {
          roomName: data.roomName,
          fromUserName: currentUser?.userName || "User",
        });

        // Also emit to receiver to open Jitsi
        socket.emit("call:accepted", {
          roomName: data.roomName,
          fromUserName: currentUser?.userName || "User",
        });

        console.log(
          `Call accepted from ${authUserId.toString()} for ${data.callerId}`,
        );
      } catch (err) {
        console.error("Error in call:accept:", err);
        socket.emit("call:error", { message: "Error accepting call" });
      }
    });

    // ❌ Call rejected - Send to caller
    socket.on("call:reject", (data) => {
      io.to(data.callerId).emit("call:rejected");
      console.log(
        `Call rejected from ${authUserId.toString()} for ${data.callerId}`,
      );
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
      const activeRoomAfterDisconnect =
        io.sockets.adapter.rooms.get(authUserRoom);
      const hasOtherActiveConnections =
        !!activeRoomAfterDisconnect && activeRoomAfterDisconnect.size > 0;

      if (hasOtherActiveConnections) {
        return;
      }

      try {
        const user = await User.findOneAndUpdate(
          { userId: authUserId },
          { isOnline: false, lastSeen: new Date() },
          { new: true },
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
