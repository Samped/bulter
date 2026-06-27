import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getUserSessionPaths } from "./user-session.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const LEGACY_BACKUP_DIR = resolve(ROOT, ".data/circle-login-sessions");

function circleHomeDir(): string {
  const sessionHome = getUserSessionPaths()?.circleHome;
  if (sessionHome) return sessionHome;
  return process.env.CIRCLE_HOME?.trim() || resolve(ROOT, ".data", "circle-home");
}

function backupDir(): string {
  const session = getUserSessionPaths();
  if (session) return join(dirname(session.circleHome), "login-request-backups");
  return LEGACY_BACKUP_DIR;
}

export function loginRequestPath(requestId: string): string {
  return join(circleHomeDir(), ".circle", "login-requests", `${requestId}.json`);
}

function backupPath(requestId: string): string {
  return join(backupDir(), `${requestId}.json`);
}

/** Copy Circle CLI login-request file so verify survives restarts. */
export function backupLoginRequestSession(requestId: string): boolean {
  const src = loginRequestPath(requestId);
  if (!existsSync(src)) return false;
  mkdirSync(backupDir(), { recursive: true });
  copyFileSync(src, backupPath(requestId));
  return true;
}

/** Restore login-request session before verify if Circle home was wiped. */
export function restoreLoginRequestSession(requestId: string): boolean {
  const dest = loginRequestPath(requestId);
  if (existsSync(dest)) return true;
  const src = backupPath(requestId);
  if (!existsSync(src)) return false;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return true;
}

export function hasLoginRequestSession(requestId: string): boolean {
  return existsSync(loginRequestPath(requestId)) || existsSync(backupPath(requestId));
}

export function readOtpHeadFromSession(requestId: string): string | undefined {
  for (const path of [loginRequestPath(requestId), backupPath(requestId)]) {
    if (!existsSync(path)) continue;
    try {
      const req = JSON.parse(readFileSync(path, "utf8")) as { otpHead?: string };
      if (typeof req.otpHead === "string" && req.otpHead.length >= 2) {
        return req.otpHead.toUpperCase();
      }
    } catch {
      /* try next */
    }
  }
  return undefined;
}
