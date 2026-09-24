import mongoose from "mongoose";
import { UserModel } from "db/client";
import { hashPassword } from "./password";

const { MONGO_URL, RECOVERY_USERNAME, RECOVERY_PASSWORD } = process.env;
if (!MONGO_URL || !RECOVERY_USERNAME || !RECOVERY_PASSWORD || RECOVERY_PASSWORD.length < 12) {
  throw new Error("Set MONGO_URL, RECOVERY_USERNAME, and a RECOVERY_PASSWORD of at least 12 characters through the deployment secret manager");
}

try {
  await mongoose.connect(MONGO_URL);
  const user = await UserModel.findOne({ username: RECOVERY_USERNAME }).select("+password");
  if (!user) throw new Error("Account was not found");
  user.password = await hashPassword(RECOVERY_PASSWORD);
  user.tokenVersion += 1;
  await user.save();
  console.log(JSON.stringify({ event: "account_recovered", userId: user._id.toString(), sessionsRevoked: true }));
} finally {
  await mongoose.disconnect();
}
