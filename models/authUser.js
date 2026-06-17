const mongoose = require("mongoose");

const AuthUserSchema = mongoose.Schema({
  email: {
    type: String,
    unique: true,
    required: true,
  },
  password: {
    type: String,
    required: false,
    default: null,
  },
  googleId: { type: String, default: null },

  createdAt: {
    type: Date,
    default: Date.now(),
  },
  lastPasswordChange: {
    type: Date,
  },
  lastLogin: {
    type: Date,
  },
});

module.exports =
  mongoose.models.authUser || mongoose.model("authUser", AuthUserSchema);
