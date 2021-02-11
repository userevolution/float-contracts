pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/presets/ERC20PresetMinterPauser.sol";

contract FloatToken is ERC20PresetMinterPauserUpgradeSafe {
    function setup(
        string calldata name,
        string calldata symbol,
        address stakerAddress
    ) public initializer {
        initialize(name, symbol);

        _setupRole(DEFAULT_ADMIN_ROLE, stakerAddress);
        _setupRole(MINTER_ROLE, stakerAddress);
        _setupRole(PAUSER_ROLE, stakerAddress);

        renounceRole(DEFAULT_ADMIN_ROLE, msg.sender);
        renounceRole(MINTER_ROLE, msg.sender);
        renounceRole(PAUSER_ROLE, msg.sender);
    }
}
