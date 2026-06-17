const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const User = require("../models/authUser");
const UserProfile = require("../models/userCreate");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.SERVER_URL}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const googleId = profile.id;
        const avatar = profile.photos?.[0]?.value || null;
        const displayName = profile.displayName || "";

        if (!email) {
          return done(null, false, { message: "No email from Google" });
        }

        // Check if user already exists (by googleId or email)
        let user = await User.findOne({ $or: [{ googleId }, { email }] });

        if (user) {
          // Link googleId if they signed up with email before
          if (!user.googleId) {
            user.googleId = googleId;
            await user.save();
          }
        } else {
          // Create a new user (no password for Google users)
          user = await User.create({
            email,
            googleId,
            password: null,
          });

          // Create a default UserProfile for new Google users
          await UserProfile.create({
            userId: user._id,
            userName: displayName,
            profileImage: avatar,
          });
        }

        user.lastLogin = new Date();
        await user.save();

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    },
  ),
);

module.exports = passport;