//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/presets/ERC20PresetMinterPauserUpgradeable.sol";

import "../interfaces/IYieldManager.sol";

/*
 * YieldManagerMock is an implementation of a yield manager that supports
 * configurable, deterministic token yields for testing. Note that the mock
 * needs to be able to mint the underlying token to simulate yield.
 */
contract YieldManagerMock is IYieldManager, Initializable {
    using SafeMathUpgradeable for uint256;

    // Admin contracts.
    address public admin;
    address public longShort;

    // Fixed-precision scale for interest percentages.
    uint256 public constant yieldScale = 1e18;

    // Global state.
    ERC20PresetMinterPauserUpgradeable public token;
    uint256 public totalHeld;
    uint256 public yieldRate; // pcnt per sec
    uint256 public lastSettled; // secs after epoch

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

    function setup(
        address _admin,
        address _longShort,
        address _token
    ) public initializer {
        // Admin contracts.
        admin = _admin;
        longShort = _longShort;

        // Global state.
        token = ERC20PresetMinterPauserUpgradeable(_token);
        lastSettled = block.timestamp;
    }

    ////////////////////////////////////
    ///// IMPLEMENTATION ///////////////
    ////////////////////////////////////

    /**
     * Adds the token's accrued yield to the token holdings.
     */
    function settle() public {
        uint256 totalYieldRate = yieldRate.mul(block.timestamp.sub(lastSettled));
        uint256 totalYield = totalHeld.mul(totalYieldRate).div(yieldScale);

        lastSettled = block.timestamp;
        totalHeld = totalHeld.add(totalYield);
        token.mint(address(this), totalYield);
    }

    /**
     * Adds the given yield to the token holdings.
     */
    function settleWithYield(uint256 yield) public adminOnly {
        uint256 totalYield = totalHeld.mul(yield).div(yieldScale);

        lastSettled = block.timestamp;
        totalHeld = totalHeld.add(totalYield);
        token.mint(address(this), totalYield);
    }

    /**
     * Sets the yield percentage per second for the given token.
     */
    function setYieldRate(uint256 _yieldRate) public adminOnly {
        yieldRate = _yieldRate;
    }

    function depositToken(uint256 amount) public override longShortOnly {
        // Ensure token state is current.
        settle();

        // Transfer tokens to manager contract.
        token.transferFrom(longShort, address(this), amount);
        totalHeld = totalHeld.add(amount);
    }

    function withdrawToken(uint256 amount) public override longShortOnly {
        // Ensure token state is current.
        settle();
        require(amount <= totalHeld);

        // Transfer tokens back to LongShort contract.
        token.transfer(longShort, amount);
        totalHeld = totalHeld.sub(amount);
    }

    function getTotalHeld() public override returns (uint256 amount) {
        settle();

        return totalHeld;
    }

    function getHeldToken() public view override returns (address _token) {
        return address(token);
    }
}
