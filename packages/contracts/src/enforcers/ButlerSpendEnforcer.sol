// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { ICaveatEnforcer, ModeCode } from "../interfaces/ICaveatEnforcer.sol";

/// @title ButlerSpendEnforcer
/// @notice ERC-7710 caveat enforcing Butler merchant allowlist + per-tx USDC caps.
/// @dev Execution must be IERC20.transfer(recipient, amount) on the configured USDC token.
interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @dev Single execution step: address target + uint256 value + bytes callData (packed or standard).
library ExecutionDecoder {
    error InvalidExecution();

    function decodeSingle(bytes calldata data) internal pure returns (address target, uint256 value, bytes calldata callData) {
        if (data.length < 20) revert InvalidExecution();
        // Support abi.encodePacked(address,uint256,bytes) used by MetaMask kit
        if (data.length >= 52 && data[20] == bytes1(0x00)) {
            target = address(bytes20(data[0:20]));
            value = uint256(bytes32(data[20:52]));
            callData = data[52:];
            return (target, value, callData);
        }
        // Standard abi.encode(address,uint256,bytes)
        (target, value, callData) = abi.decode(data, (address, uint256, bytes));
    }
}

contract ButlerSpendEnforcer is ICaveatEnforcer {
    using ExecutionDecoder for bytes;

    bytes4 private constant TRANSFER_SELECTOR = IERC20Minimal.transfer.selector;

    struct MerchantRule {
        address recipient;
        uint96 maxAmount; // USDC 6 decimals
    }

    event SpendRecorded(address indexed delegator, address indexed recipient, uint256 amount);

    /// @inheritdoc ICaveatEnforcer
    function beforeAllHook(
        bytes calldata,
        bytes calldata,
        ModeCode,
        bytes calldata,
        bytes32,
        address,
        address
    ) external pure {}

    /// @inheritdoc ICaveatEnforcer
    function afterAllHook(
        bytes calldata,
        bytes calldata,
        ModeCode,
        bytes calldata,
        bytes32,
        address,
        address
    ) external pure {}

    /// @inheritdoc ICaveatEnforcer
    function afterHook(
        bytes calldata,
        bytes calldata,
        ModeCode,
        bytes calldata,
        bytes32,
        address,
        address
    ) external pure {}

    /// @inheritdoc ICaveatEnforcer
    function beforeHook(
        bytes calldata terms,
        bytes calldata,
        ModeCode,
        bytes calldata executionCallData,
        bytes32,
        address delegator,
        address
    ) external {
        (address target, , bytes calldata callData) = executionCallData.decodeSingle();
        (address usdc, MerchantRule[] memory rules) = _decodeTerms(terms);

        require(target == usdc, "ButlerSpend:wrong-token");
        require(callData.length >= 68, "ButlerSpend:bad-calldata");
        require(bytes4(callData[0:4]) == TRANSFER_SELECTOR, "ButlerSpend:not-transfer");

        address recipient = address(bytes20(callData[16:36]));
        uint256 amount = uint256(bytes32(callData[36:68]));

        bool allowed;
        uint256 n = rules.length;
        for (uint256 i = 0; i < n; ++i) {
            if (rules[i].recipient == recipient && amount <= rules[i].maxAmount) {
                allowed = true;
                break;
            }
        }
        require(allowed, "ButlerSpend:merchant-not-allowed");

        emit SpendRecorded(delegator, recipient, amount);
    }

    function _decodeTerms(bytes calldata terms)
        internal
        pure
        returns (address usdc, MerchantRule[] memory rules)
    {
        require(terms.length >= 20, "ButlerSpend:invalid-terms");
        usdc = address(bytes20(terms[0:20]));
        uint256 ruleCount = (terms.length - 20) / 28;
        require(terms.length == 20 + ruleCount * 28, "ButlerSpend:invalid-terms-len");
        rules = new MerchantRule[](ruleCount);
        uint256 offset = 20;
        for (uint256 i = 0; i < ruleCount; ++i) {
            rules[i].recipient = address(bytes20(terms[offset:offset + 20]));
            rules[i].maxAmount = uint96(uint256(bytes32(terms[offset + 20:offset + 28])));
            offset += 28;
        }
    }

    /// @notice Encode terms for Butler policy merchants (seller = API payout address).
    function encodeTerms(address usdc, MerchantRule[] calldata rules) external pure returns (bytes memory) {
        bytes memory out = abi.encodePacked(usdc);
        uint256 n = rules.length;
        for (uint256 i = 0; i < n; ++i) {
            out = abi.encodePacked(out, rules[i].recipient, uint256(rules[i].maxAmount));
        }
        return out;
    }
}
