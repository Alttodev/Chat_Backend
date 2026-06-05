const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Subscription pricing
const SUBSCRIPTION_PLANS = {
  monthly: {
    amount: 200, // ₹2 in paise
    description: "Monthly Premium Subscription",
    period: "monthly",
  },
  yearly: {
    amount: 2400, // ₹24 in paise
    description: "Yearly Premium Subscription",
    period: "yearly",
  },
};

// Create Razorpay order
const createOrder = async (planType, userEmail) => {
  try {
    if (!SUBSCRIPTION_PLANS[planType]) {
      throw new Error("Invalid plan type");
    }

    const plan = SUBSCRIPTION_PLANS[planType];

    const order = await razorpay.orders.create({
      amount: plan.amount,
      currency: "INR",
      receipt: `order_${Date.now()}`,
      description: plan.description,
    //   customer_notify: 1,
      notes: {
        planType,
        userEmail,
      },
    });

    return order;
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    throw error;
  }
};

// Verify payment signature
const verifyPaymentSignature = (
  orderId,
  paymentId,
  signature,
  keySecret = process.env.RAZORPAY_KEY_SECRET,
) => {
  try {
    const body = orderId + "|" + paymentId;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body.toString())
      .digest("hex");

    return expectedSignature === signature;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
};

// Get payment details
const getPaymentDetails = async (paymentId) => {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    console.error("Payment fetch error:", error);
    throw error;
  }
};

// Cancel subscription
const cancelSubscription = async (subscriptionId) => {
  try {
    const result = await razorpay.subscriptions.cancel(subscriptionId);
    return result;
  } catch (error) {
    console.error("Subscription cancel error:", error);
    throw error;
  }
};

module.exports = {
  razorpay,
  createOrder,
  verifyPaymentSignature,
  getPaymentDetails,
  cancelSubscription,
  SUBSCRIPTION_PLANS,
};
