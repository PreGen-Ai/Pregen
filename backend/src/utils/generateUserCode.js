import Counter from "../models/Counter.js";
import { ROLE_PREFIX } from "./constants.js";

export async function generateUserCode(role) {
  const year = new Date().getFullYear();

  // Get prefix or fallback safely
  const prefix = ROLE_PREFIX[role] || "USR";

  const counter = await Counter.findOneAndUpdate(
    { name: `${prefix}_${year}` },
    { $inc: { sequence_value: 1 } },
    { new: true, upsert: true }
  );

  const padded = counter.sequence_value.toString().padStart(5, "0");

  return `${prefix}_${year}_${padded}`;
}
