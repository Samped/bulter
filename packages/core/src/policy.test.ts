import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDefaultPolicy, evaluateSpend, remainingDailyUsdc } from "./policy.ts";

describe("evaluateSpend", () => {
  const policy = createDefaultPolicy("0x1111111111111111111111111111111111111111");

  it("allows research API within caps", () => {
    const decision = evaluateSpend(policy, {
      agent: "research",
      merchantId: "research-summary",
      amountUsdc: "0.01",
      category: "apis",
    }, []);
    assert.equal(decision.allowed, true);
  });

  it("blocks disabled agent", () => {
    const decision = evaluateSpend(policy, {
      agent: "shopping",
      merchantId: "research-summary",
      amountUsdc: "0.01",
      category: "apis",
    }, []);
    assert.equal(decision.allowed, false);
  });

  it("tracks daily remaining", () => {
    const left = remainingDailyUsdc(policy, []);
    assert.equal(left, "25");
  });
});
