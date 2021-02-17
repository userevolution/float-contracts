//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/presets/ERC20PresetMinterPauserUpgradeable.sol";

import "./interfaces/ILongShort.sol";

contract SyntheticToken is ERC20PresetMinterPauserUpgradeable {
    bool public isLong;
    ILongShort public longShort;

    function initialize(
        string memory name,
        string memory symbol,
        address longShortAddress,
        bool _isLong
    ) public initializer {
        ERC20PresetMinterPauserUpgradeable.initialize(name, symbol);
        isLong = _isLong;
        longShort = ILongShort(longShortAddress);
    }

    function redeem(uint256 marketIndex, uint256 tokensToRedeem) public {
        _approve(_msgSender(), address(longShort), tokensToRedeem);
        if (isLong) {
            longShort.redeemLong(marketIndex, tokensToRedeem);
        } else {
            longShort.redeemShort(marketIndex, tokensToRedeem);
        }
    }
}
