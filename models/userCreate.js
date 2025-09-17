const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "authUser",
    required: true,
    unique: true,
  },
  userName: {
    type: String,
    required: true,
  },
  address: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("user", UserSchema);
