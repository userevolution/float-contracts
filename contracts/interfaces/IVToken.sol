//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/*
 * Interface for ERC20 vToken contracts, which let us interact with the
 * venus.io protocol. Note that this doesn't support minting with BNB, as
 * it's the native currency of Binance Smart Chain.
 */
abstract contract IvToken is IERC20 {
    uint8 public decimals;

    function mint(uint256) external virtual returns (uint256);

    function exchangeRateCurrent() external virtual returns (uint256);

    function redeemUnderlying(uint256) external virtual returns (uint256);

    function balanceOfUnderlying(address) external virtual returns (uint256);
}
