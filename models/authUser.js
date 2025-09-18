const mongoose = require("mongoose");

const AuthUserSchema = mongoose.Schema({
  email: {
    type: String,
    unique: true,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
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

module.exports = mongoose.model("authUser", AuthUserSchema);
