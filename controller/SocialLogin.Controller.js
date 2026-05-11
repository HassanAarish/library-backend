// import cloudinary from "cloudinary";
// import passport from "passport";
// import GoogleStrategy from "passport-google-oauth20";
// import FacebookStrategy from "passport-facebook";
// import User from "../models/User.Model.js";
// import dotenv from "dotenv";

// dotenv.config();

// Google Strategy
// passport.use(
//   new GoogleStrategy(
//     {
//       clientID: process.env.GOOGLE_CLIENT_ID,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//       callbackURL: "/auth/google/callback",
//     },
//     async (accessToken, refreshToken, profile, done) => {
//       const { id, displayName, emails, photos } = profile;

//       try {
//         // Upload profile picture to Cloudinary
//         let profilePicUrl = photos && photos[0] ? photos[0].value : null;
//         let profilePicCloudinary = null;

//         if (profilePicUrl) {
//           const uploadResponse = await cloudinary.uploader.upload(
//             profilePicUrl,
//             {
//               folder: "Library/profile-pictures/Google",
//               transformation: [{ width: 200, height: 200, crop: "thumb" }],
//             }
//           );
//           profilePicCloudinary = {
//             url: uploadResponse.secure_url,
//             public_id: uploadResponse.public_id,
//           };
//         }

//         // Check if user already exists in DB
//         let user = await User.findOne({ googleId: id });

//         if (!user) {
//           // Create a new user if it doesn't exist
//           user = new User({
//             name: displayName,
//             email: emails[0].value,
//             googleId: id,
//             authType: "google",
//             isVerified: true,
//             profilePicture: profilePicCloudinary,
//           });
//           await user.save();
//         }

//         done(null, user);
//       } catch (err) {
//         done(err, null);
//       }
//     }
//   )
// );

// Facebook Strategy
// passport.use(
//   new FacebookStrategy(
//     {
//       clientID: process.env.FACEBOOK_APP_ID,
//       clientSecret: process.env.FACEBOOK_APP_SECRET,
//       callbackURL: "/auth/facebook/callback",
//       profileFields: ["id", "displayName", "emails", "picture"],
//     },
//     async (accessToken, refreshToken, profile, done) => {
//       const { id, displayName, emails, photos } = profile;

//       try {
//         // Upload profile picture to Cloudinary
//         let profilePicUrl = photos && photos[0] ? photos[0].value : null;
//         let profilePicCloudinary = null;

//         if (profilePicUrl) {
//           const uploadResponse = await cloudinary.uploader.upload(
//             profilePicUrl,
//             {
//               folder: "Library/profile-pictures/Facebook",
//               transformation: [{ width: 200, height: 200, crop: "thumb" }],
//             }
//           );
//           profilePicCloudinary = {
//             url: uploadResponse.secure_url,
//             public_id: uploadResponse.public_id,
//           };
//         }

//         // Check if user already exists in DB
//         let user = await User.findOne({ facebookId: id });

//         if (!user) {
//           // Create a new user if not found
//           user = new User({
//             name: displayName,
//             email: emails && emails[0].value,
//             facebookId: id,
//             authType: "facebook",
//             isVerified: true,
//             profilePicture: profilePicCloudinary,
//           });
//           await user.save();
//         }

//         done(null, user);
//       } catch (err) {
//         done(err, null);
//       }
//     }
//   )
// );
