//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";

contract EthKillerOracleAggregator is Initializable {
    using SafeMathUpgradeable for uint256;

    uint256 public trxPrice;
    uint256 public eosPrice;
    uint256 public xrpPrice;
    uint256 public indexPrice;

    function setup(
        uint256 _trxPrice,
        uint256 _eosPrice,
        uint256 _xrpPrice
    ) public initializer {
        trxPrice = _trxPrice;
        eosPrice = _eosPrice;
        xrpPrice = _xrpPrice;
        indexPrice = 1e18;
    }

    function _getAssetPrice(uint256 index) internal returns (uint256) {
        // Band get Price of index
        return 10;
    }

    function _calcAbsolutePercentageChange(
        uint256 newPrice,
        uint256 basePrice,
        bool isPositiveMovement
    ) internal returns (uint256) {
        if (isPositiveMovement) {
            return (newPrice.sub(basePrice)).mul(1e18).div(basePrice);
        } else {
            return (basePrice.sub(newPrice)).mul(1e18).div(basePrice);
        }
    }

    function _calculatePrice() internal {
        uint256 newTrxPrice = _getAssetPrice(0);
        uint256 newEosPrice = _getAssetPrice(1);
        uint256 newXrpPrice = _getAssetPrice(2);

        bool isPositiveTrxPercentageChange = newTrxPrice > trxPrice;
        bool isPositiveEosPercentageChange = newEosPrice > eosPrice;
        bool isPositiveXrpPercentageChange = newXrpPrice > xrpPrice;

        uint256 trxPercentageChange =
            _calcAbsolutePercentageChange(
                newTrxPrice,
                trxPrice,
                isPositiveTrxPercentageChange
            );
        uint256 eosPercentageChange =
            _calcAbsolutePercentageChange(
                newEosPrice,
                eosPrice,
                isPositiveEosPercentageChange
            );
        uint256 xrpPercentageChange =
            _calcAbsolutePercentageChange(
                newXrpPrice,
                xrpPrice,
                isPositiveXrpPercentageChange
            );

        uint256 accumulatedPercentagePositive = 0;
        uint256 accumulatedPercentageNegative = 0;

        if (isPositiveTrxPercentageChange) {
            accumulatedPercentagePositive.add(trxPercentageChange);
        } else {
            accumulatedPercentageNegative.add(trxPercentageChange);
        }
        if (isPositiveEosPercentageChange) {
            accumulatedPercentagePositive.add(eosPercentageChange);
        } else {
            accumulatedPercentageNegative.add(eosPercentageChange);
        }
        if (isPositiveXrpPercentageChange) {
            accumulatedPercentagePositive.add(xrpPercentageChange);
        } else {
            accumulatedPercentageNegative.add(xrpPercentageChange);
        }

        bool isPositiveChange =
            accumulatedPercentagePositive > accumulatedPercentageNegative;

        uint256 averageMovement = 0;

        if (isPositiveChange) {
            averageMovement = accumulatedPercentagePositive.sub(
                accumulatedPercentageNegative
            );
        } else {
            averageMovement = accumulatedPercentageNegative.sub(
                accumulatedPercentagePositive
            );
        }

        uint256 priceMovement = indexPrice.mul(averageMovement);

        if (isPositiveChange) {
            indexPrice = indexPrice.add(priceMovement);
        } else {
            indexPrice = indexPrice.sub(priceMovement);
        }

        trxPrice = newTrxPrice;
        eosPrice = newEosPrice;
        xrpPrice = newXrpPrice;
    }

    function getPrice() public returns (uint256) {
        _calculatePrice();
        return indexPrice;
    }
}
