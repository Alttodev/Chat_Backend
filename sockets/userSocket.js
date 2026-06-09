const User = require("../models/userCreate");
const Notification = require("../models/notification");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const callSession = require("../models/callSession");

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
        authUserId = decoded?.user?.userId || decoded?.user?.id;
        console.log(authUserId, "connected with socket token");
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
        console.log(user, "User found for socket connection");
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

    // Caller sends offer
    socket.on("call:offer", async ({ receiverId, offer }) => {
      const caller = await User.findOne({
        userId: authUserId,
      });

      const session = await callSession.create({
        callerId: authUserId,
        receiverId,
        callerName: caller?.userName,
        callerImage: caller?.profileImage,
        status: "ringing",
      });

      io.to(receiverId.toString()).emit("call:offer", {
        callId: session._id,

        callerId: authUserId,
        callerName: caller?.userName,
        callerImage: caller?.profileImage,
        offer,
      });
    });

    // Receiver sends answer
    socket.on("call:answer", async ({ callId, callerId, answer }) => {
      await callSession.findByIdAndUpdate(callId, {
        status: "accepted",
      });

      const caller = await User.findOne({
        userId: callerId,
      });

      io.to(callerId.toString()).emit("call:answer", {
        answer,
        callerName: caller?.userName,
        callerImage: caller?.profileImage,
      });
    });

    // Exchange ICE candidates
    socket.on("call:ice-candidate", ({ targetUserId, candidate }) => {
      io.to(targetUserId.toString()).emit("call:ice-candidate", {
        candidate,
      });
    });

    socket.on("call:busy", ({ callerId }) => {
      io.to(callerId.toString()).emit("call:busy");
    });

    // End call
    socket.on("call:end", async ({ callId, targetUserId }) => {
      if (callId) {
        await callSession.findByIdAndUpdate(callId, {
          status: "ended",
        });
      }

      io.to(targetUserId.toString()).emit("call:end");
    });
    socket.on("call:restore", async ({ userId }) => {
      const activeCall = await callSession.findOne({
        status: {
          $in: ["ringing", "accepted"],
        },
        $or: [{ callerId: userId }, { receiverId: userId }],
      }).sort({
        createdAt: -1,
      });

      socket.emit("call:restore-result", activeCall);
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
