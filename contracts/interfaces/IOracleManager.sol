//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

abstract contract IOracleManager {
    function registerNewMarket(uint256 marketIndex, address marketFeed)
        public
        virtual;

    function getLatestPrice(uint256 marketIndex)
        public
        view
        virtual
        returns (int256);
}
