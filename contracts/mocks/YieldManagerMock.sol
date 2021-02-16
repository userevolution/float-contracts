//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

import "../interfaces/IYieldManager.sol";

// YieldManagerMock is an implementation of a yield manager that supports
// configurable or deterministic token yields for testing.
contract YieldManagerMock is IYieldManager, Initializable {
    using SafeMathUpgradeable for uint256;

    // Admin contracts.
    address public admin;
    address public longShort;

    // Fixed-precision scale for interest percentages.
    uint256 public constant yieldScale = 1e18;

    // Global state per ERC20 token.
    mapping(address => bool) public tokenEnabled;
    mapping(address => uint256) public tokenDecimals;
    mapping(address => uint256) public totalHeld;
    mapping(address => uint256) public yieldRate; // pcnt per sec
    mapping(address => uint256) public lastSettled; // secs after epoch

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

    modifier ensureEnabled(address token) {
        if (!tokenEnabled[token]) {
            ERC20 ercToken = ERC20(token);

            tokenEnabled[token] = true;
            tokenDecimals[token] = 1**ercToken.decimals();
            lastSettled[token] = block.timestamp;
        }

        _;
    }

    ////////////////////////////////////
    ///// CONTRACT SET-UP //////////////
    ////////////////////////////////////

    function setup(address _admin, address _longShort) public initializer {
        admin = _admin;
        longShort = _longShort;
    }

    ////////////////////////////////////
    ///// IMPLEMENTATION ///////////////
    ////////////////////////////////////

    // settle adds the token's accrued yield to the token holdings.
    function settle(address token) public ensureEnabled(token) {
        uint256 totalYield =
            yieldRate[token].mul(block.timestamp.sub(lastSettled[token]));

        settleWithYield(token, totalYield);
    }

    // settleWithYield adds the given yield to the token holdings.
    function settleWithYield(
        address token,
        uint256 yield
    ) public adminOnly ensureEnabled(token) {
        lastSettled[token] = block.timestamp;
        totalHeld[token] = totalHeld[token].add(
            totalHeld[token].mul(yield).div(yieldScale)
        );
    }

    // setYieldRate sets the yield percentage per second for the given token.
    function setYieldRate(
        address token,
        uint256 yield
    ) public adminOnly ensureEnabled(token) {
        yieldRate[token] = yield;
    }

    function depositToken(address token, uint256 amount)
        public
        override
        longShortOnly
        ensureEnabled(token)
    {
        // Ensure token state is current.
        settle(token);

        // Transfer tokens to manager contract.
        ERC20 ercToken = ERC20(token);
        ercToken.transferFrom(longShort, address(this), amount);
        totalHeld[token] = totalHeld[token].add(amount);
    }

    function withdrawDepositToken(address token, uint256 amount)
        public
        override
        longShortOnly
        ensureEnabled(token)
        returns (address tokenWithdrawn, uint256 amountWithdrawn)
    {
        // Ensure token state is current.
        settle(token);
        require(amount <= totalHeld[token]);

        // Transfer tokens back to LongShort contract.
        ERC20 ercToken = ERC20(token);
        ercToken.approve(longShort, amount);
        ercToken.transferFrom(address(this), longShort, amount);
        totalHeld[token] = totalHeld[token].sub(amount);
    }

    function getTotalHeld(address token)
        public
        view
        override
        returns (uint256 amount)
    {
        return totalHeld[token];
    }
}
