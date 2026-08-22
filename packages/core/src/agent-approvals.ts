import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { MARKETPLACE_AGENTS } from "./marketplace.ts";

export interface AgentApprovalsFile {
  approvedAgentIds: string[];
  updatedAt?: number;
}

const DEFAULT_LOCAL_IDS = MARKETPLACE_AGENTS.map((a) => a.id);

/** Agents that can move/plan user funds — never auto-approved when approval gate is on. */
export const EXECUTION_SENSITIVE_AGENT_IDS = new Set(["defi-execution-agent"]);

let memoryApproved: Set<string> | null = null;
let memoryPath: string | null = null;

export function requireAgentApproval(): boolean {
  return process.env.BUTLER_REQUIRE_AGENT_APPROVAL === "true";
}

function defaultApprovals(): AgentApprovalsFile {
  // Seed without execution-sensitive agents — operator must opt in.
  return {
    approvedAgentIds: DEFAULT_LOCAL_IDS.filter((id) => !EXECUTION_SENSITIVE_AGENT_IDS.has(id)),
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

export function loadAgentApprovals(path: string): Set<string> {
  if (!existsSync(path)) {
    const seed = defaultApprovals();
    saveAgentApprovals(path, seed.approvedAgentIds);
    memoryApproved = new Set(seed.approvedAgentIds);
    memoryPath = path;
    return memoryApproved;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as AgentApprovalsFile;
    const ids = Array.isArray(raw.approvedAgentIds) ? raw.approvedAgentIds.filter(Boolean) : [];
    memoryApproved = new Set(ids.length > 0 ? ids : DEFAULT_LOCAL_IDS);
  } catch {
    memoryApproved = new Set(DEFAULT_LOCAL_IDS);
  }
  memoryPath = path;
  return memoryApproved;
}

export function saveAgentApprovals(path: string, approvedAgentIds: string[]): Set<string> {
  const unique = [...new Set(approvedAgentIds)];
  const file: AgentApprovalsFile = {
    approvedAgentIds: unique,
    updatedAt: Math.floor(Date.now() / 1000),
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(file, null, 2));
  memoryApproved = new Set(unique);
  memoryPath = path;
  return memoryApproved;
}

export function initAgentApprovals(path: string): Set<string> {
  return loadAgentApprovals(path);
}

export function getApprovedAgentIds(path?: string): Set<string> {
  if (memoryApproved) return memoryApproved;
  if (path) return loadAgentApprovals(path);
  return new Set(DEFAULT_LOCAL_IDS);
}

export function isAgentApproved(agentId: string, path?: string): boolean {
  const approvals = getApprovedAgentIds(path ?? memoryPath ?? undefined);

  // When broadcast is on, execution agents must be explicitly approved — no silent pass.
  if (
    EXECUTION_SENSITIVE_AGENT_IDS.has(agentId) &&
    process.env.BUTLER_DEFI_BROADCAST === "true"
  ) {
    return approvals.has(agentId);
  }

  if (!requireAgentApproval()) return true;

  if (DEFAULT_LOCAL_IDS.includes(agentId) && !EXECUTION_SENSITIVE_AGENT_IDS.has(agentId)) {
    return true;
  }
  return approvals.has(agentId);
}

export function setAgentApproved(agentId: string, approved: boolean, path: string): Set<string> {
  const current = getApprovedAgentIds(path);
  if (approved) current.add(agentId);
  else current.delete(agentId);
  return saveAgentApprovals(path, [...current]);
}

export function etfAgentsApproved(agentIds: string[], path?: string): boolean {
  if (!requireAgentApproval()) return true;
  return agentIds.every((id) => isAgentApproved(id, path));
}
