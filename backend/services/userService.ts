import { pool } from "../config/db";
import { User } from "../models/types";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { logAction } from "./auditLogService";

const hashToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

export const getAllUsers = async (): Promise<User[]> => {
  const [rows] = await pool.query(
    "SELECT id, email, first_name, last_name, role, created_at FROM users",
  );
  return rows as User[];
};

export const getUserById = async (id: string): Promise<User | null> => {
  const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
  const users = rows as User[];
  return users.length > 0 ? users[0] : null;
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
  const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [
    email,
  ]);
  const users = rows as User[];
  return users.length > 0 ? users[0] : null;
};

export const createUser = async (
  data: Omit<User, "id" | "created_at">,
  actorId?: string,
): Promise<string> => {
  const id = uuidv4();
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(data.password_hash, salt);

  await pool.query(
    "INSERT INTO users (id, email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?, ?)",
    [
      id,
      data.email,
      hashedPassword,
      data.first_name,
      data.last_name,
      data.role,
    ],
  );

  if (actorId) {
    await logAction(actorId, "CREATE", "USER", {
      id,
      email: data.email,
      role: data.role,
    });
  }

  return id;
};

export const updateUser = async (
  id: string,
  data: Partial<User>,
  actorId?: string,
): Promise<void> => {
  const updateData: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && key !== "id" && key !== "created_at") {
      if (key === "password_hash" && typeof value === "string") {
        const isAlreadyHashed =
          value.startsWith("$2a$") || value.startsWith("$2b$");
        if (!isAlreadyHashed) {
          const salt = await bcrypt.genSalt(10);
          updateData[key] = await bcrypt.hash(value, salt);
        }
      } else {
        updateData[key] = value;
      }
    }
  }

  if (Object.keys(updateData).length === 0) return;

  const fields = Object.keys(updateData)
    .map((key) => `${key} = ?`)
    .join(", ");
  const values = Object.values(updateData);
  values.push(id);

  await pool.query(`UPDATE users SET ${fields} WHERE id = ?`, values);

  if (actorId) {
    const safeData = { ...updateData };
    delete safeData.password_hash;
    await logAction(actorId, "UPDATE", "USER", {
      target_id: id,
      changes: safeData,
    });
  }
};

export const deleteUser = async (
  id: string,
  actorId?: string,
): Promise<void> => {
  await pool.query("DELETE FROM users WHERE id = ?", [id]);
  if (actorId) {
    await logAction(actorId, "DELETE", "USER", { target_id: id });
  }
};

export const createResetToken = async (userId: string): Promise<string> => {
  const tokenId = uuidv4();
  const token = uuidv4();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1);

  await pool.query(
    "INSERT INTO tokens (id, user_id, token, type, expires_at) VALUES (?, ?, ?, 'PASSWORD_RESET', ?)",
    [tokenId, userId, hashToken(token), expiresAt],
  );
  return token;
};

export const validateResetToken = async (
  token: string,
): Promise<string | null> => {
  const [rows] = await pool.query(
    "SELECT user_id FROM tokens WHERE token = ? AND type = 'PASSWORD_RESET' AND expires_at > NOW()",
    [hashToken(token)],
  );
  const tokens = rows as any[];
  return tokens.length > 0 ? tokens[0].user_id : null;
};

export const resetPassword = async (
  userId: string,
  passwordHash: string,
): Promise<void> => {
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(passwordHash, salt);
  await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [
    hashed,
    userId,
  ]);
  await pool.query(
    "DELETE FROM tokens WHERE user_id = ? AND type = 'PASSWORD_RESET'",
    [userId],
  );
  await logAction(userId, "UPDATE", "USER", { action: "PASSWORD_RESET" });
};
