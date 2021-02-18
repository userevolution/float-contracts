//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/presets/ERC20PresetMinterPauserUpgradeable.sol";

contract SyntheticToken is ERC20PresetMinterPauserUpgradeable {
    address public longShortAddress;

    function initialize(
        string memory name,
        string memory symbol,
        address _longShortAddress
    ) public initializer {
        ERC20PresetMinterPauserUpgradeable.initialize(name, symbol);
        longShortAddress = _longShortAddress;
    }

    function synthRedeemBurn(address account, uint256 amount) external {
        require(msg.sender == longShortAddress, "Only longSHORT contract");

        _burn(account, amount);
    }
}
