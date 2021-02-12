//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "../interfaces/ILendingPoolAddressesProvider.sol";
import "./AaveLendingPool.sol";

contract LendingPoolAddressesProvider is ILendingPoolAddressesProvider {
    AaveLendingPool public aaveLendingPool;

    constructor(AaveLendingPool aaveLendingPoolAddress) public {
        aaveLendingPool = aaveLendingPoolAddress;
    }

    function getLendingPool() public view override returns (address) {
        return address(aaveLendingPool);
    }

    function getLendingPoolCore() public view override returns (address) {
        return address(aaveLendingPool);
    }
}
