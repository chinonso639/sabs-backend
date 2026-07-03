import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  displayName: string;
  email: string;
  password: string;
  phone: string;
  whatsappNumber: string;
  location: string;
  role: "user" | "creator";
  isEmailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationExpiry: Date | null;
  passwordResetToken: string | null;
  passwordResetExpiry: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(password: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    displayName: { type: String, required: true, trim: true, maxlength: 50 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 8 },
    phone: { type: String, required: true, trim: true },
    whatsappNumber: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    role: { type: String, enum: ["user", "creator"], default: "user" },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, default: null, select: false },
    emailVerificationExpiry: { type: Date, default: null, select: false },
    passwordResetToken: { type: String, default: null, select: false },
    passwordResetExpiry: { type: Date, default: null, select: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (
  password: string,
): Promise<boolean> {
  return bcrypt.compare(password, this.password);
};

userSchema.set("toJSON", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc, ret: any) => {
    ret.password = undefined;
    ret.emailVerificationToken = undefined;
    ret.emailVerificationExpiry = undefined;
    ret.passwordResetToken = undefined;
    ret.passwordResetExpiry = undefined;
    return ret;
  },
});

export const User = mongoose.model<IUser>("User", userSchema);
