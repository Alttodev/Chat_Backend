const User = require("../models/userCreate");
const RpsMatch = require("../models/rpsMatch");
const Notification = require("../models/notification");
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

    // ----- Rock Paper Scissors (RPS) game events -----
    socket.on("game:rps:invite", async (data) => {
      try {
        const toUser = data.toUserId;
        const fromUser = authUserId.toString();

        const match = await RpsMatch.create({
          fromUserId: fromUser,
          toUserId: toUser,
          status: "pending",
        });

        // Notify receiver if online
        const receiverRoom = toUser.toString();
        const room = io.sockets.adapter.rooms.get(receiverRoom);
        if (room && room.size > 0) {
          io.to(receiverRoom).emit("game:rps:invite", {
            matchId: match._id,
            fromUserId: fromUser,
            fromUserName: data.fromUserName || null,
            createdAt: match.createdAt,
          });
        }

        await Notification.create({
          type: "rps-invite",
          from: fromUser,
          to: toUser,
          matchId: match._id,
          payload: {
            fromUserName: data.fromUserName,
            roomId: data.roomId,
          },
        });

        // Acknowledge sender with match id
        socket.emit("game:rps:invite:sent", { matchId: match._id });

        if (room && room.size > 0) {
          io.to(receiverRoom).emit("new-notification", {
            type: "rps-invite",
            matchId: match._id,
            fromUserId: fromUser,
            fromUserName: data.fromUserName || null,
            message: `${data.fromUserName || "Someone"} invited you to play RPS`,
            createdAt: match.createdAt,
          });
        }
      } catch (err) {
        console.error("Error creating rps invite:", err);
        socket.emit("game:error", { message: "Failed to create invite" });
      }
    });

    socket.on("game:rps:accept", async (data) => {
      try {
        const matchId = data.matchId;
        const match = await RpsMatch.findById(matchId);
        if (!match)
          return socket.emit("game:error", { message: "Match not found" });

        match.status = "accepted";
        await match.save();

        await Notification.create({
          type: "rps-accepted",
          from: authUserId.toString(),
          to: match.fromUserId,
          matchId: match._id,
          payload: {
            toUserId: match.toUserId,
          },
        });

        // Notify both players to start the match
        io.to(match.fromUserId.toString()).emit("game:rps:accepted", {
          matchId: match._id,
          fromUserId: match.fromUserId,
          toUserId: match.toUserId,
        });
        io.to(match.fromUserId.toString()).emit("new-notification", {
          type: "rps-accepted",
          matchId: match._id,
          fromUserId: authUserId.toString(),
          message: "Your RPS invite was accepted",
          createdAt: match.updatedAt,
        });
        io.to(match.toUserId.toString()).emit("game:rps:accepted", {
          matchId: match._id,
        });
      } catch (err) {
        console.error("Error accepting rps match:", err);
        socket.emit("game:error", { message: "Failed to accept match" });
      }
    });

    socket.on("game:rps:reject", async (data) => {
      try {
        const matchId = data.matchId;
        const match = await RpsMatch.findById(matchId);
        if (!match)
          return socket.emit("game:error", { message: "Match not found" });

        match.status = "rejected";
        await match.save();

        await Notification.create({
          type: "rps-rejected",
          from: authUserId.toString(),
          to: match.fromUserId,
          matchId: match._id,
          payload: {
            toUserId: match.toUserId,
          },
        });

        io.to(match.fromUserId.toString()).emit("game:rps:rejected", {
          matchId: match._id,
        });
        io.to(match.fromUserId.toString()).emit("new-notification", {
          type: "rps-rejected",
          matchId: match._id,
          fromUserId: authUserId.toString(),
          message: "Your RPS invite was declined",
          createdAt: match.updatedAt,
        });
      } catch (err) {
        console.error("Error rejecting rps match:", err);
        socket.emit("game:error", { message: "Failed to reject match" });
      }
    });

    socket.on("game:rps:move", async (data) => {
      try {
        const matchId = data.matchId;
        const move = data.move; // "rock" | "paper" | "scissors"
        const playerId = authUserId.toString();

        const match = await RpsMatch.findById(matchId);
        if (!match)
          return socket.emit("game:error", { message: "Match not found" });
        if (match.status !== "accepted")
          return socket.emit("game:error", { message: "Match not active" });

        // store move
        match.moves = match.moves || [];
        // replace existing move for user if present
        const existing = match.moves.find(
          (m) => m.userId.toString() === playerId,
        );
        if (existing) {
          existing.move = move;
        } else {
          match.moves.push({ userId: playerId, move });
        }

        await match.save();

        // If both players moved, compute result
        if (match.moves.length >= 2) {
          const a = match.moves[0];
          const b = match.moves[1];
          const result = (() => {
            if (a.move === b.move) return "draw";
            const wins = {
              rock: "scissors",
              paper: "rock",
              scissors: "paper",
            };
            if (wins[a.move] === b.move) return a.userId.toString();
            return b.userId.toString();
          })();

          match.status = "completed";
          match.winner = result === "draw" ? null : result;
          await match.save();

          // Emit result to both players
          const payload = {
            matchId: match._id,
            moves: match.moves.map((m) => ({ userId: m.userId, move: m.move })),
            winner: match.winner,
          };
          io.to(match.fromUserId.toString()).emit("game:rps:result", payload);
          io.to(match.toUserId.toString()).emit("game:rps:result", payload);
        } else {
          // notify opponent that someone moved
          const opponentId =
            match.fromUserId.toString() === playerId
              ? match.toUserId.toString()
              : match.fromUserId.toString();
          io.to(opponentId).emit("game:rps:opponent-move", {
            matchId: match._id,
          });
        }
      } catch (err) {
        console.error("Error handling rps move:", err);
        socket.emit("game:error", { message: "Failed to register move" });
      }
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
