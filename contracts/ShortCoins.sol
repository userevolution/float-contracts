pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/presets/ERC20PresetMinterPauser.sol";

contract ShortCoins is ERC20PresetMinterPauserUpgradeSafe {
    function setup(
        string memory name,
        string memory symbol,
        address LongShortContract
    ) public initializer {
        ERC20PresetMinterPauserUpgradeSafe.initialize(name, symbol);
        _setupRole(DEFAULT_ADMIN_ROLE, LongShortContract);
        _setupRole(MINTER_ROLE, LongShortContract);
        _setupRole(PAUSER_ROLE, LongShortContract);
        // TODO: Renounce admin rights from this deployer
    }
}
