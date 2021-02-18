//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

import "../interfaces/IOracleManager.sol";

/*
 * Mock implementation of an OracleManager with fixed, changeable prices.
 */
contract OracleManagerMock is IOracleManager, Initializable {
    // Admin contract.
    address public admin;

    // Global state.
    int256 currentPrice;

    ////////////////////////////////////
    /////////// MODIFIERS //////////////
    ////////////////////////////////////

    modifier adminOnly() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    ////////////////////////////////////
    ///// CONTRACT SET-UP //////////////
    ////////////////////////////////////

    function setup(address _admin) public initializer {
        admin = _admin;
    }

    ////////////////////////////////////
    ///// IMPLEMENTATION ///////////////
    ////////////////////////////////////

    function setLatestPrice(int256 newPrice) public adminOnly {
        currentPrice = newPrice;
    }

    function getLatestPrice() public view override returns (int256) {
        return currentPrice;
    }
}
