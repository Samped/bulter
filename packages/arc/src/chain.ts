export const ARC_CHAIN_ID = 5042002;

export const arcTestnet = {
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
} as const;

export const ARC_EIP155 = "eip155:5042002" as const;
export const GATEWAY_FACILITATOR = "https://gateway-api-testnet.circle.com";
export const ARC_EXPLORER = "https://testnet.arcscan.app";
export const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;
export const DELEGATION_MANAGER = "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as const;
