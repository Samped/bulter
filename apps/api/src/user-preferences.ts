import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Request, Response } from "express";
import { getUserSessionPaths } from "./user-session.ts";

export type UserUsagePreferences = {
  displayName?: string;
  /** What the user is building, researching, or automating. */
  focusAreas?: string;
  /** Prepended to Agent tasks as standing instructions. */
  customInstructions?: string;
  defaultQualityTier?: "brief" | "standard" | "full";
  defaultCategory?: string;
  defaultMaxBudgetUsdc?: string;
  defaultAuctionMode?: "single" | "etf";
  updatedAt?: number;
};

const DEFAULTS: UserUsagePreferences = {
  defaultQualityTier: "standard",
  defaultCategory: "research",
  defaultMaxBudgetUsdc: "0.10",
  defaultAuctionMode: "single",
};

function preferencesPath(): string | null {
  const session = getUserSessionPaths();
  if (!session) return null;
  return join(dirname(session.configPath), "usage-preferences.json");
}

export function loadUserPreferences(): UserUsagePreferences {
  const path = preferencesPath();
  if (!path || !existsSync(path)) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as UserUsagePreferences;
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveUserPreferences(patch: UserUsagePreferences): UserUsagePreferences {
  const path = preferencesPath();
  const next = {
    ...loadUserPreferences(),
    ...patch,
    updatedAt: Math.floor(Date.now() / 1000),
  };
  if (!path) return next;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2));
  return next;
}

export function handleGetUserPreferences(_req: Request, res: Response): void {
  if (!getUserSessionPaths()) {
    res.status(401).json({ error: "Sign in or refresh the page to save your usage profile." });
    return;
  }
  res.json(loadUserPreferences());
}

export function handlePutUserPreferences(req: Request, res: Response): void {
  if (!getUserSessionPaths()) {
    res.status(401).json({ error: "Sign in or refresh the page to save your usage profile." });
    return;
  }
  try {
    const body = (req.body ?? {}) as UserUsagePreferences;
    const next = saveUserPreferences({
      displayName: body.displayName?.trim() || undefined,
      focusAreas: body.focusAreas?.trim() || undefined,
      customInstructions: body.customInstructions?.trim() || undefined,
      defaultQualityTier: body.defaultQualityTier,
      defaultCategory: body.defaultCategory,
      defaultMaxBudgetUsdc: body.defaultMaxBudgetUsdc?.trim() || undefined,
      defaultAuctionMode: body.defaultAuctionMode,
    });
    res.json(next);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Preferences save failed" });
  }
}
