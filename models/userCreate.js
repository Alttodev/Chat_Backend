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
  email: {
    type: String,
    required: true,
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 150,
    default: "",
  },
  isPublic: {
    type: Boolean,
    default: false,
  },
  address: String,
  profileImage: {
    type: String,
    default: null,
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },

  isVerified: {
    type: Boolean,
    default: false,
  },

  isOnline: {
    type: Boolean,
    default: false,
  },
  lastSeen: {
    type: Date,
  },

  pushNotification: {
    enabled: {
      type: Boolean,
      default: true,
    },
    sound: {
      type: Boolean,
      default: true,
    },
    vibration: {
      type: Boolean,
      default: true,
    },
  },

  pushTokens: [
    {
      token: {
        type: String,
        required: true,
      },
      deviceName: {
        type: String,
        default: null,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      lastSeenAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],

  isPremium: {
    type: Boolean,
    default: false,
  },

  premiumSubscriptionEndDate: {
    type: Date,
    default: null,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

UserSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports =
  mongoose.models.user ||
  mongoose.model("user", UserSchema);
