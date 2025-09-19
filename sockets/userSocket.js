const User = require("../models/userCreate");

const userSocket = (io) => {
  io.on("connection", async (socket) => {
    const { userId } = socket.handshake.query;
    if (!userId) {
      console.log("No userId provided");
      return;
    }

    try {
      const user = await User.findOneAndUpdate(
        { userId },
        { isOnline: true },
        { new: true }
      );
      if (user) {
        console.log("User set online:", user.userName);
      } else {
        console.log("User not found for userId:", userId);
      }
    } catch (err) {
      console.error("Error updating user online status:", err);
    }

    socket.join(userId);
    io.emit("user-online", userId);

    socket.on("check-user-status", async (id) => {
      const online = io.sockets.adapter.rooms.has(id) ? true : false;
      socket.emit("user-status", { id, online });
    });

    socket.on("disconnect", async () => {
      try {
        const user = await User.findOneAndUpdate(
          { userId },
          { isOnline: false, lastSeen: new Date() },
          { new: true }
        );
        if (user) {
          console.log("User set offline:", user.userName);
        }
      } catch (err) {
        console.error("Error updating lastSeen on disconnect:", err);
      }

      io.emit("user-offline", userId);
    });
  });
};

module.exports = userSocket;
