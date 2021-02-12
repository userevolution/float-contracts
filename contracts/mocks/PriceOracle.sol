//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";

// Mock price oracle for testing to deliver certain prices
contract PriceOracle is AggregatorV3Interface {
    int256 public assetPrice;

    constructor(int256 _initialPrice) public {
        assetPrice = _initialPrice;
    }

    function decimals() external view override returns (uint8) {
        return 10;
    }

    function description() external view override returns (string memory) {
        return "mystring";
    }

    function version() external view override returns (uint256) {
        return 10;
    }

    // getRoundData and latestRoundData should both raise "No data present"
    // if they do not have data to report, instead of returning unset values
    // which could be misinterpreted as actual reported values.
    function getRoundData(uint80 _roundId)
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (0, 0, 0, 0, 0);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (0, assetPrice, 0, 0, 0);
    }

    function increasePrice(int256 _percentage) public {
        assetPrice = assetPrice + ((assetPrice * _percentage) / (10**18));
    }

    function decreasePrice(int256 _percentage) public {
        assetPrice = assetPrice - ((assetPrice * _percentage) / (10**18));
    }
}
