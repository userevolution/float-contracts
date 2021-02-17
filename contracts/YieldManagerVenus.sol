//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

import "./interfaces/IYieldManager.sol";
import "./interfaces/IVToken.sol";

/*
 * YieldManagerVenus is an implementation of a yield manager that earns
 * APY through the venus.io protocol. Each underlying asset (such as BUSD)
 * has a corresponding vToken (such as vBUSD) that continuously accrues
 * interest based on a lend/borrow liquidity ratio.
 *     see: https://docs.venus.io/docs/vtokens
 */
contract YieldManagerVenus is IYieldManager, Initializable {
    using SafeMathUpgradeable for uint256;

    // Admin contracts.
    address public admin;
    address public longShort;

    // Global state.
    ERC20 token; // underlying asset token
    IvToken vToken; // corresponding vToken

    ////////////////////////////////////
    /////////// MODIFIERS //////////////
    ////////////////////////////////////

    modifier adminOnly() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier longShortOnly() {
        require(msg.sender == longShort, "Not longShort");
        _;
    }

    ////////////////////////////////////
    ///// CONTRACT SET-UP //////////////
    ////////////////////////////////////

    /*
     * Initialises the yield manager with the given underlying asset token
     * and corresponding venus vToken. We have to check whether it's BNB,
     * since BNB has a different interface to other ERC20 tokens in venus.io.
     */
    function setup(
        address _admin,
        address _longShort,
        address _token,
        address _vToken
    ) public initializer {
        admin = _admin;
        longShort = _longShort;

        token = ERC20(_token);
        vToken = IvToken(_vToken);
    }

    ////////////////////////////////////
    ///// IMPLEMENTATION ///////////////
    ////////////////////////////////////

    function depositToken(uint256 amount) public override longShortOnly {
        // Transfer tokens to manager contract.
        token.transferFrom(longShort, address(this), amount);

        // Transfer tokens to vToken contract to mint vTokens.
        token.approve(address(vToken), amount);
        uint256 result = vToken.mint(amount);

        // See https://docs.venus.io/docs/vtokens#error-codes.
        require(result == 0);
    }

    function withdrawToken(uint256 amount) public override longShortOnly {
        // Redeem vToken for underlying asset tokens.
        // TODO(guy): Handle edge-case where there isn't enough liquidity
        //   on venus.io to redeem enough underlying assets.
        uint256 result = vToken.redeemUnderlying(amount);

        // See https://docs.venus.io/docs/vtokens#error-codes.
        require(result == 0);

        // Transfer tokens back to LongShort contract.
        token.transfer(longShort, amount);
    }

    function getTotalHeld() public override returns (uint256 amount) {
        return vToken.balanceOfUnderlying(address(this));
    }

    function getHeldToken() public view override returns (address _token) {
        return address(token);
    }
}
