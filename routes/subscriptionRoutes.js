const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const UserProfile = require("../models/userCreate");
const Subscription = require("../models/subscription");
const auth = require("../middleware/auth");
const {
  createOrder,
  verifyPaymentSignature,
  SUBSCRIPTION_PLANS,
} = require("../utils/razorpay");

// Create subscription order (Monthly)
router.post("/create-order/monthly", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await UserProfile.findOne({ userId });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User profile not found" });
    }

    const order = await createOrder("monthly", user.email);

    const subscription = new Subscription({
      userId: new mongoose.Types.ObjectId(userId),
      planType: "monthly",
      amount: SUBSCRIPTION_PLANS.monthly.amount,
      razorpayOrderId: order.id,
      status: "pending",
    });

    await subscription.save();

    res.status(200).json({
      success: true,
      message: "Monthly subscription order created",
      order,
      subscriptionId: subscription._id,
    });
  } catch (err) {
    console.error("Monthly subscription error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create subscription order",
    });
  }
});

// Create subscription order (Yearly)
router.post("/create-order/yearly", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await UserProfile.findOne({ userId });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User profile not found" });
    }

    const order = await createOrder("yearly", user.email);

    const subscription = new Subscription({
      userId: new mongoose.Types.ObjectId(userId),
      planType: "yearly",
      amount: SUBSCRIPTION_PLANS.yearly.amount,
      razorpayOrderId: order.id,
      status: "pending",
    });

    await subscription.save();

    res.status(200).json({
      success: true,
      message: "Yearly subscription order created",
      order,
      subscriptionId: subscription._id,
    });
  } catch (err) {
    console.error("Yearly subscription error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create subscription order",
    });
  }
});

// Verify payment and complete subscription
router.post("/verify-payment", auth, async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const userId = req.user.id;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: "Missing required payment details",
      });
    }

    // Verify signature
    const isSignatureValid = verifyPaymentSignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    );

    if (!isSignatureValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // Find subscription
    const subscription = await Subscription.findOne({
      razorpayOrderId,
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    // Update subscription with payment details
    subscription.razorpayPaymentId = razorpayPaymentId;
    subscription.razorpaySignature = razorpaySignature;
    subscription.status = "completed";
    subscription.isActive = true;

    // Calculate end date based on plan type
    const startDate = new Date();
    const endDate = new Date();
    if (subscription.planType === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (subscription.planType === "yearly") {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    subscription.subscriptionStartDate = startDate;
    subscription.subscriptionEndDate = endDate;

    await subscription.save();

    // Update user profile with subscription status
    const user = await UserProfile.findOne({ userId });
    if (user) {
      user.isPremium = true;
      user.premiumSubscriptionEndDate = endDate;
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: "Payment verified and subscription activated",
      subscription,
    });
  } catch (err) {
    console.error("Payment verification error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Payment verification failed",
    });
  }
});

// Get subscription status
router.get("/status", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await Subscription.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      isActive: true,
    }).sort({ createdAt: -1 });

    if (!subscription) {
      return res.status(200).json({
        success: true,
        message: "No active subscription found",
        subscription: null,
        isSubscribed: false,
      });
    }

    const isExpired = new Date() > subscription.subscriptionEndDate;

    if (isExpired) {
      subscription.isActive = false;
      await subscription.save();

      // Update user profile
      const user = await UserProfile.findOne({ userId });
      if (user) {
        user.isPremium = false;
        await user.save();
      }

      return res.status(200).json({
        success: true,
        message: "Subscription has expired",
        subscription: null,
        isSubscribed: false,
      });
    }

    res.status(200).json({
      success: true,
      message: "Active subscription found",
      subscription,
      isSubscribed: true,
      daysRemaining: Math.ceil(
        (subscription.subscriptionEndDate - new Date()) / (1000 * 60 * 60 * 24),
      ),
    });
  } catch (err) {
    console.error("Get subscription status error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to fetch subscription status",
    });
  }
});

// Cancel subscription
router.post("/cancel", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await Subscription.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      isActive: true,
    }).sort({ createdAt: -1 });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "No active subscription found",
      });
    }

    subscription.isActive = false;
    subscription.status = "cancelled";
    await subscription.save();

    // Update user profile
    const user = await UserProfile.findOne({ userId });
    if (user) {
      user.isPremium = false;
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: "Subscription cancelled successfully",
      subscription,
    });
  } catch (err) {
    console.error("Subscription cancellation error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to cancel subscription",
    });
  }
});

module.exports = router;
