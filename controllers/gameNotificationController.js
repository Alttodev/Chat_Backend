const mongoose = require("mongoose");
const User = require("../models/userCreate");
const GameNotification = require("../models/gameNotification");

const getCurrentUser = async (authUserId) => {
  return User.findOne({ userId: authUserId }).lean();
};

exports.getUserNotifications = async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req.user.id);
    if (!currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const notifications = await GameNotification.find({ to: currentUser._id })
      .populate("from", "userName profileImage userId")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, notifications });
  } catch (err) {
    console.error("Error fetching game notifications:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid notification id" });
    }

    const currentUser = await getCurrentUser(req.user.id);
    if (!currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const notification = await GameNotification.findOneAndUpdate(
      { _id: id, to: currentUser._id },
      { isRead: true },
      { new: true },
    ).lean();

    if (!notification) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({ success: true, notification });
  } catch (err) {
    console.error("Error marking game notification as read:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
