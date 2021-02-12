//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/presets/ERC20PresetMinterPauserUpgradeable.sol";

abstract contract IADai is ERC20PresetMinterPauserUpgradeable {
    function redeem(uint256 _amount) public virtual;
    //function redirectInterestStream(address _to) public virtual;
}
