pragma solidity ^0.6.0;

import "@openzeppelin/contracts-ethereum-package/contracts/presets/ERC20PresetMinterPauser.sol";

abstract contract IADai is ERC20PresetMinterPauserUpgradeSafe {
    function redeem(uint256 _amount) public virtual;
    //function redirectInterestStream(address _to) public virtual;
}
