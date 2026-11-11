import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      match: [/.+@.+\..+/, "Please fill a valid email address"],
    },
    password: {
      type: String,
      required: function () {
        return this.authType === "email";
      },
    },
    authType: {
      type: String,
      enum: ["email", "google", "facebook"],
      default: "email",
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    facebookId: {
      type: String,
      unique: true,
      sparse: true,
    },
    stripeCustomerId: {
      type: String,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    twoFactor: {
      enabled: { type: Boolean, default: false },
      secret: { type: String },
    },
    otp: {
      code: { type: Number },
      expiry: { type: Date },
      attempts: { type: Number, default: 0 },
    },
    // Tokens issued before this moment are rejected by verifyToken.
    passwordChangedAt: { type: Date },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    resetPassword: {
      token: { type: String },
      expiry: { type: Date },
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    // Self-service account deletion (services/AccountDeletion.Service.js):
    // closed at requestedAt, anonymised at scheduledFor unless they sign in again.
    deletion: {
      requestedAt: { type: Date },
      scheduledFor: { type: Date },
      completedAt: { type: Date },
    },
    // Set once the account has been anonymised. Such users can't sign in.
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

/**
 * Pre-save Hook: Hashes password before saving to DB
 */
UserSchema.pre("save", async function () {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("password") || !this.password) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  // A changed password invalidates every existing session. Backdated by 1s
  // because JWT `iat` has second precision — a token issued right after this
  // save must still count as newer.
  if (!this.isNew) {
    this.passwordChangedAt = new Date(Date.now() - 1000);
  }
});

/**
 * Instance Method: Compare entered password with hashed password
 * We use 'this.password' which is available after a .select("+password") query
 */
UserSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", UserSchema);

export default User;
