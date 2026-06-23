// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

type ModeCode is bytes32;

/// @dev Minimal ERC-7710 caveat interface (MetaMask Delegation Framework compatible).
interface ICaveatEnforcer {
    function beforeAllHook(
        bytes calldata terms,
        bytes calldata args,
        ModeCode mode,
        bytes calldata executionCallData,
        bytes32 delegationHash,
        address delegator,
        address redeemer
    ) external;

    function beforeHook(
        bytes calldata terms,
        bytes calldata args,
        ModeCode mode,
        bytes calldata executionCallData,
        bytes32 delegationHash,
        address delegator,
        address redeemer
    ) external;

    function afterHook(
        bytes calldata terms,
        bytes calldata args,
        ModeCode mode,
        bytes calldata executionCallData,
        bytes32 delegationHash,
        address delegator,
        address redeemer
    ) external;

    function afterAllHook(
        bytes calldata terms,
        bytes calldata args,
        ModeCode mode,
        bytes calldata executionCallData,
        bytes32 delegationHash,
        address delegator,
        address redeemer
    ) external;
}
