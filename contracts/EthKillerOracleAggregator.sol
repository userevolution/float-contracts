//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";

contract EthKillerOracleAggregator is Initializable {
    using SafeMathUpgradeable for uint256;

    address public admin; // This will likely be the Gnosis safe

    int256 public indexPrice;

    int256 public tronPrice;
    int256 public eosPrice;
    int256 public xrpPrice;

    function setup(address _admin) public initializer {
        admin = _admin;

        // Initialising asset prices
        tronPrice = _getAssetPrice(0);
        eosPrice = _getAssetPrice(1);
        xrpPrice = _getAssetPrice(2);

        // Initialiasing base index price
        indexPrice = 1e18;
    }

    function _getAssetPrice(uint256 index) internal returns (int256) {
        // index 0 = tron
        // index 1 =  eos
        // index 2 = ripple
        // Call to band oracle for assets price
        return 1e18;
    }

    function _calculatePrice() internal {
        int256 newTronPrice = _getAssetPrice(0);
        int256 newEosPrice = _getAssetPrice(1);
        int256 newXrpPrice = _getAssetPrice(2);

        int256 valueOfChangeInIndex =
            (indexPrice *
                (_calcAbsolutePercentageChange(newTronPrice, tronPrice) +
                    _calcAbsolutePercentageChange(newEosPrice, eosPrice) +
                    _calcAbsolutePercentageChange(newXrpPrice, xrpPrice))) /
                (3 * 1e18);

        // Set new prices
        tronPrice = newTronPrice;
        eosPrice = newEosPrice;
        xrpPrice = newXrpPrice;

        // Set new index price
        indexPrice = indexPrice + valueOfChangeInIndex;
    }

    function _calcAbsolutePercentageChange(int256 newPrice, int256 basePrice)
        internal
        returns (int256)
    {
        return ((newPrice - basePrice) * (1e18)) / (basePrice);
    }

    function getLatestPrice() external returns (int256) {
        _calculatePrice();
        return indexPrice;
    }
}
