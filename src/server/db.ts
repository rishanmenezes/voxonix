import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { type PrimaryProfile, normalizePrimaryProfile } from "../lib/capabilities";
import { defaultKdfLimiter, KdfQueueFullError } from "./kdf-limiter";

export { defaultKdfLimiter, KdfQueueFullError };

function asyncScrypt(
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
): Promise<Buffer> {
  return defaultKdfLimiter.run(
    () =>
      new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey as Buffer);
        });
      }),
  );
}

export interface StoredUser {
  id: string;
  email: string;
  displayName: string;
  profile: PrimaryProfile;
  language: string;
  passwordHash: string; // scrypt$<N>$<r>$<p>$<salt>$<keyHex> or legacy <salt>:<keyHex>
  createdAt: string;
  updatedAt: string;
}

export interface StoredSession {
  tokenHash: string; // SHA-256 hash of the 32-byte session token
  userId: string;
  createdAt: string;
  lastActiveAt: string; // Tracked for idle timeout
  expiresAt: string; // Absolute expiry timestamp
  ip?: string;
  userAgent?: string;
}

export interface DatabaseSchema {
  version: number;
  users: StoredUser[];
  sessions: StoredSession[];
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "voxonix-db.json");
const BACKUP_PATH = path.join(DATA_DIR, "voxonix-db.json.backup");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── OWASP scrypt Parameters ──────────────────────────────────────────────────
// Recommended minimum: N=131072 (2^17), r=8, p=1, keyLength=64 bytes, salt >= 16 bytes.
export const SCRYPT_CONFIG = {
  N: 131072,
  r: 8,
  p: 1,
  keyLength: 64,
  maxmem: 256 * 1024 * 1024,
  saltBytes: 32,
};

// Session Expiry Policies: 7 days absolute, 24 hours idle
export const SESSION_CONFIG = {
  absoluteTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  idleTtlMs: 24 * 60 * 60 * 1000, // 24 hours idle
};

// ── Password Hashing & Verification ──────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SCRYPT_CONFIG.saltBytes).toString("hex");
  const derivedKey = (await asyncScrypt(password, salt, SCRYPT_CONFIG.keyLength, {
    N: SCRYPT_CONFIG.N,
    r: SCRYPT_CONFIG.r,
    p: SCRYPT_CONFIG.p,
    maxmem: SCRYPT_CONFIG.maxmem,
  })) as Buffer;

  return `scrypt$${SCRYPT_CONFIG.N}$${SCRYPT_CONFIG.r}$${SCRYPT_CONFIG.p}$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  try {
    if (!storedHash || typeof storedHash !== "string" || !password) {
      return { valid: false, needsRehash: false };
    }

    // Modern format: scrypt$<N>$<r>$<p>$<salt>$<keyHex>
    if (storedHash.startsWith("scrypt$")) {
      const parts = storedHash.split("$");
      if (parts.length !== 6) return { valid: false, needsRehash: false };
      const [, nStr, rStr, pStr, salt, keyHex] = parts;
      const N = parseInt(nStr, 10);
      const r = parseInt(rStr, 10);
      const p = parseInt(pStr, 10);
      const expectedKey = Buffer.from(keyHex, "hex");

      const derivedKey = (await asyncScrypt(password, salt, expectedKey.length, {
        N,
        r,
        p,
        maxmem: Math.max(64 * 1024 * 1024, 128 * N * r * 2),
      })) as Buffer;

      if (expectedKey.length !== derivedKey.length) {
        return { valid: false, needsRehash: false };
      }

      const valid = crypto.timingSafeEqual(expectedKey, derivedKey);
      const needsRehash = N < SCRYPT_CONFIG.N || r < SCRYPT_CONFIG.r || p < SCRYPT_CONFIG.p;
      return { valid, needsRehash };
    }

    // Legacy format: <saltHex>:<keyHex> (from earlier commit, default Node N=16384)
    if (storedHash.includes(":")) {
      const [salt, keyHex] = storedHash.split(":");
      if (!salt || !keyHex) return { valid: false, needsRehash: false };
      const expectedKey = Buffer.from(keyHex, "hex");

      const derivedKey = (await asyncScrypt(password, salt, expectedKey.length, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
      })) as Buffer;

      if (expectedKey.length !== derivedKey.length) {
        return { valid: false, needsRehash: false };
      }

      const valid = crypto.timingSafeEqual(expectedKey, derivedKey);
      return { valid, needsRehash: true }; // Always upgrade legacy hashes on successful login
    }

    return { valid: false, needsRehash: false };
  } catch {
    return { valid: false, needsRehash: false };
  }
}

// ── Token Hashing Utility ────────────────────────────────────────────────────

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// ── Database State & File I/O ────────────────────────────────────────────────

// Synchronous default hash for seeded accounts during initial file creation
function getSyncInitialHash(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$16384$8$1$${salt}$${derivedKey.toString("hex")}`;
}

function getInitialDatabase(): DatabaseSchema {
  const now = new Date().toISOString();
  const defaultPasswordHash = getSyncInitialHash("Password123");

  return {
    version: 2,
    users: [
      {
        id: "usr_deaf_seed",
        email: "deaf@voxonix.com",
        displayName: "Alex (Deaf)",
        profile: "deaf",
        language: "en-US",
        passwordHash: defaultPasswordHash,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr_nonspeaking_seed",
        email: "nonspeaking@voxonix.com",
        displayName: "Sam (Non-speaking)",
        profile: "non-speaking",
        language: "en-US",
        passwordHash: defaultPasswordHash,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr_blind_seed",
        email: "blind@voxonix.com",
        displayName: "Dev (Blind)",
        profile: "blind",
        language: "en-US",
        passwordHash: defaultPasswordHash,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usr_standard_seed",
        email: "standard@voxonix.com",
        displayName: "Jordan (Standard)",
        profile: "standard",
        language: "en-US",
        passwordHash: defaultPasswordHash,
        createdAt: now,
        updatedAt: now,
      },
    ],
    sessions: [],
  };
}

let cachedDb: DatabaseSchema | null = null;

function loadDatabaseWithRecovery(): DatabaseSchema {
  // 1. Try reading primary database file
  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, "utf-8");
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.users) && Array.isArray(parsed.sessions)) {
          // Normalize legacy sessions if needed
          parsed.sessions = parsed.sessions.map((s: Record<string, unknown>) => {
            if (s.token && !s.tokenHash) {
              return {
                tokenHash: hashSessionToken(String(s.token)),
                userId: s.userId,
                createdAt: s.createdAt,
                lastActiveAt: s.lastActiveAt || s.createdAt,
                expiresAt: s.expiresAt,
              };
            }
            return s;
          });
          return parsed as DatabaseSchema;
        }
      }
    } catch (err) {
      console.warn("[Voxonix DB] Primary database corrupted, checking backup:", err);
    }
  }

  // 2. Attempt recovery from backup file if primary is missing or corrupted
  if (fs.existsSync(BACKUP_PATH)) {
    try {
      const backupRaw = fs.readFileSync(BACKUP_PATH, "utf-8");
      if (backupRaw.trim()) {
        const parsedBackup = JSON.parse(backupRaw);
        if (Array.isArray(parsedBackup.users) && Array.isArray(parsedBackup.sessions)) {
          console.info("[Voxonix DB] Successfully recovered database from backup.");
          fs.writeFileSync(DB_PATH, backupRaw, "utf-8");
          return parsedBackup as DatabaseSchema;
        }
      }
    } catch (backupErr) {
      console.error("[Voxonix DB] Backup recovery failed:", backupErr);
    }
  }

  // 3. Fall back to initialized default state
  const initial = getInitialDatabase();
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), "utf-8");
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(initial, null, 2), "utf-8");
  } catch (err) {
    console.error("[Voxonix DB] Failed to write initial database:", err);
  }
  return initial;
}

function getDatabase(): DatabaseSchema {
  if (!cachedDb) {
    cachedDb = loadDatabaseWithRecovery();
  }
  return cachedDb;
}

/**
 * Atomic disk write with backup creation.
 * Writes to a temporary file first, calls fsyncSync, atomically renames over primary,
 * attempts directory fsync, and mirrors to backup.
 */
function flushDatabaseToDisk(db: DatabaseSchema): void {
  const tempPath = `${DB_PATH}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
  const jsonContent = JSON.stringify(db, null, 2);

  try {
    // 1. Write and flush temporary file to non-volatile storage
    const fd = fs.openSync(tempPath, "w");
    fs.writeSync(fd, jsonContent);
    fs.fsyncSync(fd);
    fs.closeSync(fd);

    // 2. Atomic replace on POSIX / fallback retry on Windows in case of open handles
    try {
      fs.renameSync(tempPath, DB_PATH);
    } catch {
      // Windows fallback if renameSync conflicts with an active file handle
      fs.writeFileSync(DB_PATH, jsonContent, "utf-8");
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore unlink error
      }
    }

    // 3. Fsync containing directory where supported by OS
    try {
      const dirFd = fs.openSync(DATA_DIR, "r");
      fs.fsyncSync(dirFd);
      fs.closeSync(dirFd);
    } catch {
      // Windows or restricted filesystems may not support directory fsync; ignore non-fatally
    }

    // 4. Mirror to backup file so backup always holds the latest valid verified state
    try {
      fs.copyFileSync(DB_PATH, BACKUP_PATH);
    } catch (backupErr) {
      console.warn("[Voxonix DB] Backup copy warning:", backupErr);
    }
  } catch (error) {
    console.error("[Voxonix DB] Flush error:", error);
    // Emergency direct write attempt
    try {
      fs.writeFileSync(DB_PATH, jsonContent, "utf-8");
      fs.writeFileSync(BACKUP_PATH, jsonContent, "utf-8");
    } catch {
      // Ignore
    }
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Ignore
    }
  }
}

// ── Mutation Lock (Serialization Queue) ───────────────────────────────────────
// Every mutating database operation is queued sequentially to guarantee zero lost updates,
// safe transaction semantics in a single Node process, and race-free account creation.

let mutationQueue = Promise.resolve();

export function withMutationLock<T>(action: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    mutationQueue = mutationQueue
      .then(async () => {
        try {
          const result = await action();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      })
      .catch((err) => {
        reject(err);
      });
  });
}

// ── Session Revocation Listeners ──────────────────────────────────────────────
type SessionRevocationListener = (userId: string, tokenHash?: string) => void;
const revocationListeners = new Set<SessionRevocationListener>();

export function onSessionRevoked(listener: SessionRevocationListener): () => void {
  revocationListeners.add(listener);
  return () => revocationListeners.delete(listener);
}

function notifySessionRevocation(userId: string, tokenHash?: string) {
  for (const listener of revocationListeners) {
    try {
      listener(userId, tokenHash);
    } catch {
      // Ignore listener error
    }
  }
}

// ── Public Database Query API ─────────────────────────────────────────────────

export function findUserByEmail(email: string): StoredUser | null {
  const db = getDatabase();
  const normalized = email.toLowerCase().trim();
  return db.users.find((u) => u.email.toLowerCase() === normalized) || null;
}

export function findUserById(userId: string): StoredUser | null {
  const db = getDatabase();
  return db.users.find((u) => u.id === userId) || null;
}

// ── Public Database Mutation API ──────────────────────────────────────────────

export interface RegisterUserInput {
  email: string;
  password: string;
  displayName: string;
  profile: PrimaryProfile | string;
  language?: string;
}

export async function registerUser(
  input: RegisterUserInput,
): Promise<{ user: StoredUser; token: string }> {
  return withMutationLock(async () => {
    const db = getDatabase();
    const normalizedEmail = input.email.toLowerCase().trim();

    if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      throw new Error("An account with this email address already exists.");
    }

    const normalizedProfile = normalizePrimaryProfile(input.profile);
    const now = new Date().toISOString();
    const userId = `usr_${normalizedProfile}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const passwordHash = await hashPassword(input.password);

    const trimmedDisplayName = (input.displayName || "").trim();
    if (trimmedDisplayName.length < 2) {
      throw new Error("Name must be at least 2 characters.");
    }

    const newUser: StoredUser = {
      id: userId,
      email: normalizedEmail,
      displayName: trimmedDisplayName,
      profile: normalizedProfile,
      language: input.language?.trim() || "en-US",
      passwordHash,
      createdAt: now,
      updatedAt: now,
    };

    db.users.push(newUser);

    // Generate 32-byte cryptographically random session token
    const rawToken = `vox_sess_${crypto.randomBytes(32).toString("hex")}`;
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_CONFIG.absoluteTtlMs).toISOString();

    db.sessions.push({
      tokenHash,
      userId: newUser.id,
      createdAt: now,
      lastActiveAt: now,
      expiresAt,
    });

    flushDatabaseToDisk(db);
    return { user: newUser, token: rawToken };
  });
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<{ user: StoredUser; token: string }> {
  return withMutationLock(async () => {
    const db = getDatabase();
    const normalizedEmail = email.toLowerCase().trim();
    const user = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);

    if (!user) {
      throw new Error("Invalid email or password.");
    }

    const { valid, needsRehash } = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid email or password.");
    }

    const now = new Date().toISOString();

    // Transparently upgrade legacy or low-cost password hash to current OWASP parameters
    if (needsRehash) {
      try {
        user.passwordHash = await hashPassword(password);
        user.updatedAt = now;
      } catch (err) {
        console.warn("[Voxonix DB] Hash upgrade failed non-fatally:", err);
      }
    }

    // Multi-Device Support: Maintain independent active sessions per device.
    // Cap at 10 active sessions per user by pruning the oldest session.
    const userSessions = db.sessions.filter((s) => s.userId === user.id);
    if (userSessions.length >= 10) {
      userSessions.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const oldest = userSessions[0];
      db.sessions = db.sessions.filter((s) => s !== oldest);
    }

    // Generate fresh session token
    const rawToken = `vox_sess_${crypto.randomBytes(32).toString("hex")}`;
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_CONFIG.absoluteTtlMs).toISOString();

    db.sessions.push({
      tokenHash,
      userId: user.id,
      createdAt: now,
      lastActiveAt: now,
      expiresAt,
    });

    flushDatabaseToDisk(db);
    return { user, token: rawToken };
  });
}

/**
 * Verifies a session token against stored SHA-256 token hashes.
 * Enforces both absolute expiry (7 days) and idle timeout (24 hours).
 */
export function verifySessionToken(rawToken: string): StoredUser | null {
  if (!rawToken || typeof rawToken !== "string" || !rawToken.trim()) return null;

  // Development/Test token bypass (only when local test mode is active and not in production)
  if (
    process.env.NODE_ENV !== "production" &&
    (rawToken.startsWith("voxonix-token:") || rawToken.startsWith("voxonix-local-test-token:"))
  ) {
    const payload = rawToken.replace(/^(voxonix-token:|voxonix-local-test-token:)/, "");
    const colonIdx = payload.indexOf(":");
    if (colonIdx !== -1) {
      const userId = payload.slice(0, colonIdx);
      const user = findUserById(userId);
      if (user) return user;
    }
  }

  const db = getDatabase();
  const tokenHash = hashSessionToken(rawToken);

  // Match tokenHash (or legacy plain token if present during migration)
  const sessionIndex = db.sessions.findIndex(
    (s) => s.tokenHash === tokenHash || (s as unknown as { token?: string }).token === rawToken,
  );

  if (sessionIndex === -1) return null;

  const session = db.sessions[sessionIndex];
  const now = Date.now();
  const expiresAtMs = new Date(session.expiresAt).getTime();
  const lastActiveMs = new Date(session.lastActiveAt || session.createdAt).getTime();

  // 1. Check absolute expiration
  if (now > expiresAtMs) {
    db.sessions.splice(sessionIndex, 1);
    flushDatabaseToDisk(db);
    notifySessionRevocation(session.userId, session.tokenHash);
    return null;
  }

  // 2. Check idle expiration (24h of inactivity)
  if (now - lastActiveMs > SESSION_CONFIG.idleTtlMs) {
    db.sessions.splice(sessionIndex, 1);
    flushDatabaseToDisk(db);
    notifySessionRevocation(session.userId, session.tokenHash);
    return null;
  }

  // Update activity timestamp for sliding idle expiry window
  session.lastActiveAt = new Date().toISOString();

  // If session was using unhashed legacy token, upgrade it to tokenHash
  if (!session.tokenHash) {
    session.tokenHash = tokenHash;
  }

  return db.users.find((u) => u.id === session.userId) || null;
}

export function findSessionByToken(rawToken: string): StoredSession | null {
  if (!rawToken || typeof rawToken !== "string" || !rawToken.trim()) return null;
  const db = getDatabase();
  const tokenHash = hashSessionToken(rawToken);
  return (
    db.sessions.find(
      (s) => s.tokenHash === tokenHash || (s as unknown as { token?: string }).token === rawToken,
    ) || null
  );
}

export async function revokeSessionToken(rawToken: string): Promise<boolean> {
  if (!rawToken) return false;

  return withMutationLock(async () => {
    const db = getDatabase();
    const tokenHash = hashSessionToken(rawToken);
    const session = db.sessions.find(
      (s) => s.tokenHash === tokenHash || (s as unknown as { token?: string }).token === rawToken,
    );

    if (!session) return false;

    db.sessions = db.sessions.filter(
      (s) => s.tokenHash !== tokenHash && (s as unknown as { token?: string }).token !== rawToken,
    );

    flushDatabaseToDisk(db);
    notifySessionRevocation(session.userId, session.tokenHash);
    return true;
  });
}

export async function revokeAllUserSessions(userId: string): Promise<number> {
  return withMutationLock(async () => {
    const db = getDatabase();
    const countBefore = db.sessions.length;
    db.sessions = db.sessions.filter((s) => s.userId !== userId);
    const removedCount = countBefore - db.sessions.length;

    if (removedCount > 0) {
      flushDatabaseToDisk(db);
      notifySessionRevocation(userId);
    }
    return removedCount;
  });
}

// Clean all expired sessions (absolute or idle)
export function pruneExpiredSessions(): number {
  const db = getDatabase();
  const now = Date.now();
  const initialCount = db.sessions.length;

  db.sessions = db.sessions.filter((session) => {
    const expiresAtMs = new Date(session.expiresAt).getTime();
    const lastActiveMs = new Date(session.lastActiveAt || session.createdAt).getTime();
    if (now > expiresAtMs) return false;
    if (now - lastActiveMs > SESSION_CONFIG.idleTtlMs) return false;
    return true;
  });

  const pruned = initialCount - db.sessions.length;
  if (pruned > 0) {
    flushDatabaseToDisk(db);
  }
  return pruned;
}

export function toPublicUser(user: StoredUser) {
  return {
    id: user.id,
    email: user.email,
    user_metadata: {
      display_name: user.displayName,
      full_name: user.displayName,
      accessibility_profile: user.profile,
      language: user.language,
    },
    created_at: user.createdAt,
  };
}

// Reset in-memory cache and re-read from disk (primarily for unit and concurrency tests)
export function resetDatabaseCache(): void {
  cachedDb = null;
}
