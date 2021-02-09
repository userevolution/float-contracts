pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

contract OracleManagerMock is Initializable {
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
        longShortOnly
    {
        oracleFeeds[marketIndex] = marketFeed;
        int256 price = oraclePrices[marketFeed];
        // Initialise the price for testing convenience
        if (price == 0) {
            oraclePrices[marketFeed] = 1000000000000000000;
        }
    }

    function getLatestPrice(uint256 marketIndex) public view returns (int256) {
        address feed = oracleFeeds[marketIndex];
        int256 price = oraclePrices[feed];
        return price;
    }
}
