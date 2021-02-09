pragma solidity 0.6.12;

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
