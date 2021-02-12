//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

abstract contract IAaveLendingPool {
    function deposit(
        address _reserve,
        uint256 _amount,
        uint16 _referralCode
    ) public virtual;
}
