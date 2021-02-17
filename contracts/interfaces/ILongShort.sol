//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

contract ILongShort {
    function redeemLong(uint256 marketIndex, uint256 tokensToRedeem)
        external
        virtual
    {}

    function redeemShort(uint256 marketIndex, uint256 tokensToRedeem)
        external
        virtual
    {}
}
