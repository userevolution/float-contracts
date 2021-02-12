//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "../interfaces/IOracleManager.sol";

contract OracleManagerMock is IOracleManager, Initializable {
    address public admin;
    address public longShortContract;

    mapping(uint256 => address) public oracleFeeds; // Oracle
    mapping(address => int256) public oraclePrices; // Oracle

    modifier adminOnly() {
        require(msg.sender == admin, "Not admin");
        _;
    }
    modifier longShortOnly() {
        require(msg.sender == longShortContract, "Not longShort");
        _;
    }

    function setup(address _admin, address _longShort) public initializer {
        admin = _admin;
        longShortContract = _longShort;
    }

    function setMarketPriceByIndex(uint256 marketIndex, int256 price)
        public
        adminOnly
    {
        address marketFeed = oracleFeeds[marketIndex];
        oraclePrices[marketFeed] = price;
    }

    function registerNewMarket(uint256 marketIndex, address marketFeed)
        public
        override
        longShortOnly
    {
        oracleFeeds[marketIndex] = marketFeed;
        int256 price = oraclePrices[marketFeed];
        // Initialise the price for testing convenience
        if (price == 0) {
            oraclePrices[marketFeed] = 10e18;
        }
    }

    function getLatestPrice(uint256 marketIndex)
        public
        view
        override
        returns (int256)
    {
        address feed = oracleFeeds[marketIndex];
        int256 price = oraclePrices[feed];
        return price;
    }
}
