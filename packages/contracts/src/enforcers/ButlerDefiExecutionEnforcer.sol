// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { ICaveatEnforcer, ModeCode } from "../interfaces/ICaveatEnforcer.sol";

/**
 * @title ButlerDefiExecutionEnforcer
 * @notice DRAFT — NOT DEPLOYED / NOT WIRED. Do not use in production without audit.
 *
 * @dev Design intent (mirrors TypeScript guards in apps/api/src/agents/defi-execution):
 *  - Allowlisted target contracts only (CCTP TokenMessenger, Universal Router, …)
 *  - Allowlisted selectors only
 *  - Max amount per redemption
 *
 * Current production enforcer `ButlerSpendEnforcer` only permits IERC20.transfer to
 * merchant recipients. Swaps/bridges MUST NOT be forced through that contract.
 *
 * Until this contract is audited, deployed, and wired in packages/delegation,
 * the DeFi Execution Agent refuses broadcast regardless of env flags.
 */
contract ButlerDefiExecutionEnforcer is ICaveatEnforcer {
    error ButlerDefiNotConfigured();

    function beforeAllHook(
        bytes calldata,
        bytes calldata,
        ModeCode,
        bytes calldata,
        bytes32,
        address,
        address
    ) external pure override {
        revert ButlerDefiNotConfigured();
    }

    function beforeHook(
        bytes calldata,
        bytes calldata,
        ModeCode,
        bytes calldata,
        bytes32,
        address,
        address
    ) external pure override {
        revert ButlerDefiNotConfigured();
    }

    function afterHook(
        bytes calldata,
        bytes calldata,
        ModeCode,
        bytes calldata,
        bytes32,
        address,
        address
    ) external pure override {}

    function afterAllHook(
        bytes calldata,
        bytes calldata,
        ModeCode,
        bytes calldata,
        bytes32,
        address,
        address
    ) external pure override {}
}
