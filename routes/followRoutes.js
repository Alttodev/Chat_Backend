const express = require("express");
const FollowRequest = require("../models/followRequest");
const User = require("../models/userCreate");
const auth = require("../middleware/auth");

module.exports = (io) => {
  const router = express.Router();

  router.post("/send/:id", auth, async (req, res) => {
    try {
      const user = await User.findOne({ userId: req.user.id });
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const toUser = await User.findById(req.params.id);
      if (!toUser) {
        return res
          .status(404)
          .json({ success: false, message: "Target user not found" });
      }

      const request = new FollowRequest({
        from: user._id,
        to: toUser._id,
      });
      await request.save();

      // io.to(request.from._id.toString()).emit("new-notification", {
      //   type: "follow-response",
      //   to: { id: request.to._id, name: request.to.userName },
      //   message: `Your follow request was ${request.status}`,
      // });

      res.status(201).json({
        success: true,
        message: "Follow request sent successfully",
        request,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.put("/:id/respond", auth, async (req, res) => {
    try {
      const { action } = req.body;

      const request = await FollowRequest.findById(req.params.id)
        .populate("from")
        .populate("to");

      if (!request) {
        return res
          .status(404)
          .json({ success: false, message: "Request not found" });
      }

      if (request.to._id.toString() !== req.user.id) {
        return res
          .status(403)
          .json({ success: false, message: "Not authorized" });
      }

      request.status = action === "accept" ? "accepted" : "declined";
      await request.save();

      io.to(request.from._id.toString()).emit("new-notification", {
        type: "follow-response",
        to: { id: request.to._id, name: request.to.userName },
        message: `Your follow request was ${request.status}`,
      });

      res.json({
        success: true,
        message: `Follow request ${request.status}`,
        request,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.get("/requests", auth, async (req, res) => {
    try {
      const user = await User.findOne({ userId: req.user.id });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const requests = await FollowRequest.find({ to: user._id })
        .populate("from", "userName email address")
        .populate("to", "userName email address")
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        count: requests.length,
        requests,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  router.get("/requests/:fromId/:toId", auth, async (req, res) => {
    try {
      const { fromId, toId } = req.params;

      const request = await FollowRequest.findOne({ from: fromId, to: toId });

      if (!request) {
        return res
          .status(404)
          .json({ success: false, message: "No request found between users" });
      }

      res.json({ success: true, request });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  return router;
};
