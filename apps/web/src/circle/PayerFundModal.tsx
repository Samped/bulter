import { useState } from "react";
import { createPortal } from "react-dom";
import { fundCircleWallet, shortAddr } from "../api.ts";

export function PayerFundModal({
  open,
  walletAddress,
  onClose,
  onFunded,
}: {
  open: boolean;
  walletAddress: string | null;
  onClose: () => void;
  onFunded?: () => void;
}) {
  const [fundBusy, setFundBusy] = useState(false);
  const [fundMessage, setFundMessage] = useState<string | null>(null);

  if (!open || !walletAddress) return null;

  const handleFundWallet = async () => {
    setFundBusy(true);
    setFundMessage(null);
    try {
      await fundCircleWallet();
      setFundMessage("Testnet USDC is on the way. Gateway balance updates in about a minute.");
      onFunded?.();
    } catch (e) {
      setFundMessage(e instanceof Error ? e.message : "Could not fund wallet. Try the Circle faucet link below.");
    } finally {
      setFundBusy(false);
    }
  };

  return createPortal(
    <div className="payer-fund-backdrop" role="presentation" onClick={onClose}>
      <div
        className="payer-fund-modal"
        role="dialog"
        aria-label="Fund Gateway USDC"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="payer-fund-title">Fund Gateway USDC</p>
        <p className="payer-fund-copy">
          Get free testnet USDC on Arc, then deposit to Gateway so Butler can pay x402 agents.
        </p>
        <p className="payer-fund-wallet">
          Your wallet: <code>{shortAddr(walletAddress)}</code>
        </p>
        <button
          type="button"
          className="btn primary payer-fund-btn"
          disabled={fundBusy}
          onClick={() => void handleFundWallet()}
        >
          {fundBusy ? "Sending tokens…" : "Get testnet USDC"}
        </button>
        <p className="muted small payer-fund-alt">
          Or use{" "}
          <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
            faucet.circle.com
          </a>{" "}
          (Arc testnet), then run <code>circle gateway deposit --method direct</code>.
        </p>
        {fundMessage && <p className="payer-fund-msg">{fundMessage}</p>}
        <button type="button" className="btn ghost sm payer-fund-dismiss" onClick={onClose}>
          Continue to app
        </button>
      </div>
    </div>,
    document.body
  );
}
