// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { Script, console2 } from "forge-std/Script.sol";
import { ButlerSpendEnforcer } from "../src/enforcers/ButlerSpendEnforcer.sol";

/// @notice Deploy ButlerSpendEnforcer on Arc testnet.
/// @dev MetaMask Delegation Framework v1.3.0 must already exist on chain (CREATE2 deploy).
contract DeployButlerEnforcer is Script {
    address constant DELEGATION_MANAGER = 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3;

    function run() external {
        uint256 pk = vm.envUint("BUTLER_DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);

        require(DELEGATION_MANAGER.code.length > 0, "DelegationManager not on chain — deploy framework first");

        ButlerSpendEnforcer enforcer = new ButlerSpendEnforcer();
        console2.log("ButlerSpendEnforcer", address(enforcer));

        vm.stopBroadcast();
    }
}
