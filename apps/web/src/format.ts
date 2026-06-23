/** Strip emoji from API / CLI errors shown in the dashboard. */
export function sanitizeUserMessage(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}\u2600-\u27BF\uFE0F]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatWorkflowError(raw: string): string {
  const text = sanitizeUserMessage(raw);
  if (/insufficient gateway balance/i.test(text)) {
    return "Insufficient Gateway USDC. Fund your payer wallet at faucet.circle.com (Arc testnet), then deposit to Gateway.";
  }
  if (/cannot read properties of undefined \(reading 'ok'\)/i.test(text)) {
    return "Settlement response was incomplete. Retry the task; if it persists, restart the API (npm run dev) and confirm Circle payer is logged in.";
  }
  if (/payment endpoint timed out|gateway payment returned no result/i.test(text)) {
    return "A workflow step timed out. Retry once and keep the tab open — full theses target ~1 minute.";
  }
  if (/signal is aborted/i.test(text)) {
    return "Request was cancelled or timed out. Keep this tab open while the payer agent runs (auctions can take 1–2 minutes).";
  }
  const short = text.split(/Common causes:|Technical details:/i)[0]?.trim() ?? text;
  return short.length > 220 ? `${short.slice(0, 217)}...` : short;
}
