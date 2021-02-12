//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";

import "./SyntheticToken.sol";
import "./TokenFactory.sol";
import "./Staker.sol";

/**
 * @dev {LongShort} contract, including:
 *
 *  - Ability for users to create synthetic long and short positions on value movements
 *  - Value movements could be derived from tradional or alternative asset classes, derivates, binary outcomes, etc...
 *  - Incentive mechansim providing fees to liquidity makers (users on both sides of order book)
 *
 * ******* SYSTEM FUNCTIONING V0.0 ***********
 * System accepts stable coin (DAI) and has a total locked value = short position value + long position value
 * If percentage movement as calculated from oracle is +10%, and short position value == long position value,
 * Then value change = long position value * 10%
 * long position value = long position value + value change
 * short position value = short position value - value change
 * Total contract value remains unchanged.
 * long value has increased and each longtoken is now worth more as underlying pool value has increased.
 *
 * Tokens representing a shares in the short or long token pool can be minted
 * at price (short position value) / (total short token value)
 * or conversely burned to redeem the underlying share of the pool calculated
 * as (short position value) / (total short token value) per token
 *
 * Depending on demand of minting and burning for underlying on both sides (long/short of contract),
 * most often short position value != long position value (there will be an imbalance)
 * Imbalances also naturally occur as the contract adjusts these values after observing oracle value changes
 * Incentives exist to best incentivize contract balance.
 *
 * Mechanism 1 - interest accural imbalance.
 * The entire total locked value accrues interest and distributes it 50/50 even if imbalance exists.
 * I.e. Short side supplys $50 capital. Long side supply $150. Short side effectively earns interest on $100.
 * Enhanced yield exists for sides taking on the position with less demand.
 *
 * Mechanism 2 - liquidity fees earned.
 * The side which is shorter on liquidity will receive fees strengthening their value
 * Whenever liquidity is added to the opposing side or withdrawn from their side (i.e. when the imbalance increases)
 *
 * ******* KNOWN ATTACK VECTORS ***********
 * (1) Feeless withdrawl:
 * [FIXED]
 * Long position $150, Short position $100. User should pay fee to remove short liquidity.
 * Step1: User mints $51 of short position (No fee to add liquidity).
 * Step2: User redeems $100 of short position (no fee as currently removing liquidity from bigger side)
 * Possible solution, check after deposit/withdrawl if order book has flipped, then apply fees.
 *
 * (2) FlashLoan mint:
 * [ONGOING]
 * Consider rapid large entries and exit of the system.
 *
 * (3) Oracle manipulation:
 * [ONGOING]
 * If the oracle determining price change can be easy manipulated (and by a decent magnitude),
 * Funds could be at risk. See: https://blog.trailofbits.com/2020/08/05/accidentally-stepping-on-a-defi-lego/
 *
 * ******* Work on gas effciencies ***********
 * Layer 2 solutions
 * Remove safe Math library
 */
contract LongShort is Initializable {
    using SafeMathUpgradeable for uint256;

    ////////////////////////////////////
    //////// VARIABLES /////////////////
    ////////////////////////////////////

    // Global state.
    address public admin; // This will likely be the Gnosis safe
    uint256 public latestMarket;
    uint256 public totalValueLocked;
    mapping(uint256 => bool) public marketExists;

    // Factory for dynamically creating synthetic long/short tokens.
    TokenFactory public tokenFactory;
    Staker public staker;

    // Fixed-precision constants.
    uint256 public constant TEN_TO_THE_18 = 10**18;
    uint256 public constant feeUnitsOfPrecision = 10000;

    // Market state.
    mapping(uint256 => uint256) public assetPrice;
    mapping(uint256 => uint256) public totalValueLockedInMarket;
    mapping(uint256 => uint256) public longValue;
    mapping(uint256 => uint256) public shortValue;
    mapping(uint256 => uint256) public longTokenPrice;
    mapping(uint256 => uint256) public shortTokenPrice;
    mapping(uint256 => uint256) public externalContractCounter;
    mapping(uint256 => IERC20) public fundTokens;
    mapping(uint256 => AggregatorV3Interface) internal priceFeed;

    // Synthetic long/short tokens users can mint and redeem.
    mapping(uint256 => SyntheticToken) public longTokens;
    mapping(uint256 => SyntheticToken) public shortTokens;

    // Fees for minting/redeeming long/short tokens. Users are penalised
    // with extra fees for imbalancing the market.
    mapping(uint256 => uint256) public baseEntryFee;
    mapping(uint256 => uint256) public badLiquidityEntryFee;
    mapping(uint256 => uint256) public baseExitFee;
    mapping(uint256 => uint256) public badLiquidityExitFee;

    ////////////////////////////////////
    /////////// EVENTS /////////////////
    ////////////////////////////////////

    event V1(); // TODO: add all init variables here!
    event ValueLockedInSystem(
        uint256 marketIndex,
        uint256 contractCallCounter,
        uint256 totalValueLockedInMarket,
        uint256 longValue,
        uint256 shortValue
    );
    event TokenPriceRefreshed(
        uint256 marketIndex,
        uint256 contractCallCounter,
        uint256 longTokenPrice,
        uint256 shortTokenPrice
    );
    event FeesLevied(
        uint256 marketIndex,
        uint256 contractCallCounter,
        uint256 totalFees,
        uint256 longPercentage,
        uint256 shortPercentage
    );
    event SyntheticTokenCreated(
        uint256 marketIndex,
        address longTokenAddress,
        address shortTokenAddress,
        uint256 assetPrice,
        string name,
        string symbol,
        address oracleAddress,
        uint256 baseEntryFee,
        uint256 badLiquidityEntryFee,
        uint256 baseExitFee,
        uint256 badLiquidityExitFee
    );
    event PriceUpdate(
        uint256 marketIndex,
        uint256 contractCallCounter,
        uint256 oldPrice,
        uint256 newPrice,
        address user
    );
    event LongMinted(
        uint256 marketIndex,
        uint256 contractCallCounter,
        uint256 depositAdded,
        uint256 finalDepositAmount,
        uint256 tokensMinted,
        address user
    );
    event ShortMinted(
        uint256 marketIndex,
        uint256 contractCallCounter,
        uint256 depositAdded,
        uint256 finalDepositAmount,
        uint256 tokensMinted,
        address user
    );
    event LongRedeem(
        uint256 marketIndex,
        uint256 contractCallCounter,
        uint256 tokensRedeemed,
        uint256 valueOfRedemption,
        uint256 finalRedeemValue,
        address user
    );
    event ShortRedeem(
        uint256 marketIndex,
        uint256 contractCallCounter,
        uint256 tokensRedeemed,
        uint256 valueOfRedemption,
        uint256 finalRedeemValue,
        address user
    );

    ////////////////////////////////////
    /////////// MODIFIERS //////////////
    ////////////////////////////////////

    /**
     * Necessary to update system state before any contract actions (deposits / withdraws)
     */

    modifier adminOnly() {
        require(msg.sender == admin);
        _;
    }

    modifier doesMarketExist(uint256 marketIndex) {
        require(marketExists[marketIndex]);
        _;
    }

    modifier refreshSystemState(uint256 marketIndex) {
        _updateSystemState(marketIndex);
        _;
    }

    modifier updateCounterIfExternalCall(uint256 marketIndex) {
        if (msg.sender != address(this)) {
            externalContractCounter[marketIndex]++;
        }
        _;
    }

    ////////////////////////////////////
    ///// CONTRACT SET-UP //////////////
    ////////////////////////////////////

    function setup(
        address _admin,
        address _tokenFactory,
        address _staker
    ) public initializer {
        admin = _admin;
        tokenFactory = TokenFactory(_tokenFactory);
        staker = Staker(_staker);

        emit V1();
    }

    ////////////////////////////////////
    /// MULTISIG ADMIN CREATE MARKETS //
    ////////////////////////////////////

    function newSyntheticMarket(
        string calldata syntheticName,
        string calldata syntheticSymbol,
        address _fundToken,
        address _oracleFeed,
        uint256 _baseEntryFee,
        uint256 _badLiquidityEntryFee,
        uint256 _baseExitFee,
        uint256 _badLiquidityExitFee
    ) external adminOnly {
        uint256 marketNumber = latestMarket.add(1);

        // Initial minting/redeeming fees.
        baseEntryFee[marketNumber] = _baseEntryFee;
        baseExitFee[marketNumber] = _baseExitFee;
        badLiquidityEntryFee[marketNumber] = _badLiquidityEntryFee;
        badLiquidityExitFee[marketNumber] = _badLiquidityExitFee;

        // Initial market state.
        fundTokens[marketNumber] = IERC20(_fundToken);
        priceFeed[marketNumber] = AggregatorV3Interface(_oracleFeed);

        // Create new synthetic long token.
        longTokens[marketNumber] = SyntheticToken(
            tokenFactory.createTokenLong(syntheticName, syntheticSymbol)
        );

        // Create new synthetic short token.
        shortTokens[marketNumber] = SyntheticToken(
            tokenFactory.createTokenShort(syntheticName, syntheticSymbol)
        );

        // Initial market state.
        longTokenPrice[marketNumber] = TEN_TO_THE_18;
        shortTokenPrice[marketNumber] = TEN_TO_THE_18;
        assetPrice[marketNumber] = uint256(getLatestPrice(marketNumber));

        // Update global state.
        latestMarket = marketNumber;
        marketExists[marketNumber] = true;

        // Add new staker funds with fresh synthetic tokens.
        staker.addNewStakingFund(
            marketNumber,
            address(longTokens[marketNumber]),
            address(shortTokens[marketNumber])
        );

        // TODO(guy): Update this event to track _fundToken address, need to
        // change the graph handlers and schema to track that too.
        emit SyntheticTokenCreated(
            marketNumber,
            address(longTokens[marketNumber]),
            address(shortTokens[marketNumber]),
            assetPrice[marketNumber],
            syntheticName,
            syntheticSymbol,
            _oracleFeed,
            _baseEntryFee,
            _badLiquidityEntryFee,
            _baseExitFee,
            _badLiquidityExitFee
        );
    }

    ////////////////////////////////////
    //////// HELPER FUNCTIONS //////////
    ////////////////////////////////////

    /**
     * Returns the latest price
     */
    function getLatestPrice(uint256 marketIndex) public view returns (int256) {
        (
            uint80 roundID,
            int256 price,
            uint256 startedAt,
            uint256 timeStamp,
            uint80 answeredInRound
        ) = priceFeed[marketIndex].latestRoundData();
        return price;
    }

    /**
     * Returns % of long position that is filled
     */
    function getLongBeta(uint256 marketIndex) public view returns (uint256) {
        // TODO account for contract start when these are both zero
        // and an erronous beta of 1 reported.
        if (shortValue[marketIndex] >= longValue[marketIndex]) {
            return TEN_TO_THE_18;
        } else {
            return
                shortValue[marketIndex].mul(TEN_TO_THE_18).div(
                    longValue[marketIndex]
                );
        }
    }

    /**
     * Returns % of short position that is filled
     * zero div error if both are zero
     */
    function getShortBeta(uint256 marketIndex) public view returns (uint256) {
        if (longValue[marketIndex] >= shortValue[marketIndex]) {
            return TEN_TO_THE_18;
        } else {
            return
                longValue[marketIndex].mul(TEN_TO_THE_18).div(
                    shortValue[marketIndex]
                );
        }
    }

    /**
     * Adjusts the long/short token prices according to supply and value.
     */
    function _refreshTokensPrice(uint256 marketIndex) internal {
        uint256 longTokenSupply = longTokens[marketIndex].totalSupply();
        if (longTokenSupply > 0) {
            longTokenPrice[marketIndex] = longValue[marketIndex]
                .mul(TEN_TO_THE_18)
                .div(longTokenSupply);
        }
        uint256 shortTokenSupply = shortTokens[marketIndex].totalSupply();
        if (shortTokenSupply > 0) {
            shortTokenPrice[marketIndex] = shortValue[marketIndex]
                .mul(TEN_TO_THE_18)
                .div(shortTokenSupply);
        }
        emit TokenPriceRefreshed(
            marketIndex,
            externalContractCounter[marketIndex],
            longTokenPrice[marketIndex],
            shortTokenPrice[marketIndex]
        );
    }

    /**
     * Controls what happens with mint/redeem fees.
     * This is a v1 mechanism.
     */
    function _feesMechanism(
        uint256 marketIndex,
        uint256 totalFees,
        uint256 longPercentage,
        uint256 shortPercentage
    ) internal {
        _increaseLongShortSides(
            marketIndex,
            totalFees,
            longPercentage,
            shortPercentage
        );

        emit FeesLevied(
            marketIndex,
            externalContractCounter[marketIndex],
            totalFees,
            longPercentage,
            shortPercentage
        );
    }

    /**
     * Splits the given amount between the long/short sides.
     */
    function _increaseLongShortSides(
        uint256 marketIndex,
        uint256 amount,
        uint256 longPercentage,
        uint256 shortPercentage
    ) internal {
        require(100 == shortPercentage.add(longPercentage)); // Possibly remove this check as internal function. Save gas.

        if (amount != 0) {
            uint256 longSideIncrease = amount.mul(longPercentage).div(100);
            uint256 shortSideIncrease = amount.sub(longSideIncrease);
            longValue[marketIndex] = longValue[marketIndex].add(
                longSideIncrease
            );
            shortValue[marketIndex] = shortValue[marketIndex].add(
                shortSideIncrease
            );
        }
    }

    // TODO fix with beta
    function _priceChangeMechanism(uint256 marketIndex, uint256 newPrice)
        internal
    {
        // If no new price update from oracle, proceed as normal
        if (assetPrice[marketIndex] == newPrice) {
            return;
        }
        // 100% -> 10**18
        // 100% -> 1
        uint256 percentageChange;
        uint256 valueChange = 0;
        // Long gains
        if (newPrice > assetPrice[marketIndex]) {
            percentageChange = (newPrice.sub(assetPrice[marketIndex]))
                .mul(TEN_TO_THE_18)
                .div(assetPrice[marketIndex]);
            if (percentageChange >= TEN_TO_THE_18) {
                // More than 100% price movement, system liquidation.
                longValue[marketIndex] = longValue[marketIndex].add(
                    shortValue[marketIndex]
                );
                shortValue[marketIndex] = 0;
            } else {
                if (getShortBeta(marketIndex) == TEN_TO_THE_18) {
                    valueChange = shortValue[marketIndex]
                        .mul(percentageChange)
                        .div(TEN_TO_THE_18);
                } else {
                    valueChange = longValue[marketIndex]
                        .mul(percentageChange)
                        .div(TEN_TO_THE_18);
                }
                longValue[marketIndex] = longValue[marketIndex].add(
                    valueChange
                );
                shortValue[marketIndex] = shortValue[marketIndex].sub(
                    valueChange
                );
            }
        } else {
            percentageChange = (assetPrice[marketIndex].sub(newPrice))
                .mul(TEN_TO_THE_18)
                .div(assetPrice[marketIndex]);
            if (percentageChange >= TEN_TO_THE_18) {
                shortValue[marketIndex] = shortValue[marketIndex].add(
                    longValue[marketIndex]
                );
                longValue[marketIndex] = 0;
            } else {
                if (getShortBeta(marketIndex) == TEN_TO_THE_18) {
                    valueChange = shortValue[marketIndex]
                        .mul(percentageChange)
                        .div(TEN_TO_THE_18);
                } else {
                    valueChange = longValue[marketIndex]
                        .mul(percentageChange)
                        .div(TEN_TO_THE_18);
                }
                longValue[marketIndex] = longValue[marketIndex].sub(
                    valueChange
                );
                shortValue[marketIndex] = shortValue[marketIndex].add(
                    valueChange
                );
            }
        }
    }

    /**
     * Updates the value of the long and short sides within the system
     * Note this is public. Anyone can call this function.
     */
    function _updateSystemState(uint256 marketIndex)
        public
        doesMarketExist(marketIndex)
        updateCounterIfExternalCall(marketIndex)
    {
        // This is called right before any state change!
        // So reward rate can be calculated just in time by
        // staker without needing to be saved
        staker.addNewStateForFloatRewards(
            address(longTokens[marketIndex]),
            address(shortTokens[marketIndex]),
            longTokenPrice[marketIndex],
            shortTokenPrice[marketIndex],
            longValue[marketIndex],
            shortValue[marketIndex]
        );

        if (longValue[marketIndex] == 0 && shortValue[marketIndex] == 0) {
            return;
        }

        // TODO: Check why/if this is bad (casting to uint)
        // If a negative int is return this should fail.
        uint256 newPrice = uint256(getLatestPrice(marketIndex));
        emit PriceUpdate(
            marketIndex,
            externalContractCounter[marketIndex],
            assetPrice[marketIndex],
            newPrice,
            msg.sender
        );

        // Adjusts long and short values based on price movements.
        // $1
        // $100 on each side.
        // $1.1 10% increase
        // $90 on short side. $110 on the long side.
        if (longValue[marketIndex] > 0 && shortValue[marketIndex] > 0) {
            _priceChangeMechanism(marketIndex, newPrice);
        }

        // TODO: Interest mechanism and governance tokens.

        _refreshTokensPrice(marketIndex);
        assetPrice[marketIndex] = newPrice;

        emit ValueLockedInSystem(
            marketIndex,
            externalContractCounter[marketIndex],
            totalValueLockedInMarket[marketIndex],
            longValue[marketIndex],
            shortValue[marketIndex]
        );
        // For extra robustness while testing.
        // TODO: Consider gas cost trade-off of removing
        require(
            longValue[marketIndex].add(shortValue[marketIndex]) ==
                totalValueLockedInMarket[marketIndex],
            "Total locked inconsistent"
        );
    }

    /*
     * Locks funds from the sender into the given market.
     */
    function _depositFunds(uint256 marketIndex, uint256 amount) internal {
        require(amount > 0, "User needs to add positive amount");

        // TODO: Interest mechanism, probably lend coins to venus.
        fundTokens[marketIndex].transferFrom(msg.sender, address(this), amount);

        totalValueLockedInMarket[marketIndex] = totalValueLockedInMarket[
            marketIndex
        ]
            .add(amount);

        totalValueLocked = totalValueLocked.add(amount);
    }

    /*
     * Returns locked funds from the market to the sender.
     */
    function _withdrawFunds(uint256 marketIndex, uint256 amount) internal {
        totalValueLockedInMarket[marketIndex] = totalValueLockedInMarket[
            marketIndex
        ]
            .sub(amount);

        totalValueLocked = totalValueLocked.sub(amount);

        // TODO: May need to liquidate venus coins if we're out of funds.
        fundTokens[marketIndex].transfer(msg.sender, amount);
    }

    /*
     * Calculates fees for the given base amount and an additional penalty
     * amount that extra fees are paid on. Users are penalised for imbalancing
     * the market.
     */
    function _getFeesForAmounts(
        uint256 marketIndex,
        uint256 baseAmount, // e18
        uint256 penaltyAmount, // e18
        bool isMint // true for mint, false for redeem
    ) internal returns (uint256) {
        uint256 baseRate = 0; // base fee pcnt paid for all actions
        uint256 penaltyRate = 0; // penalty fee pcnt paid for imbalancing

        if (isMint) {
            baseRate = baseEntryFee[marketIndex];
            penaltyRate = badLiquidityEntryFee[marketIndex];
        } else {
            baseRate = baseExitFee[marketIndex];
            penaltyRate = badLiquidityExitFee[marketIndex];
        }

        uint256 baseFee = baseAmount.mul(baseRate).div(feeUnitsOfPrecision);

        uint256 penaltyFee =
            penaltyAmount.mul(penaltyRate).div(feeUnitsOfPrecision);

        return baseFee.add(penaltyFee);
    }

    /**
     * Calculates fees for the given mint/redeem amount. Users are penalised
     * with higher fees for imbalancing the market.
     */
    function _getFeesForAction(
        uint256 marketIndex,
        uint256 amount, // 1e18
        uint256 longValue, // 1e18
        uint256 shortValue, // 1e18
        bool isMint, // true for mint, false for redeem
        bool isLong // true for long side, false for short side
    ) internal returns (uint256) {
        // Edge-case: no penalties for minting in a 1-sided market.
        // TODO: Is this what we want for new markets?
        if (isMint && (longValue == 0 || shortValue == 0)) {
            return _getFeesForAmounts(marketIndex, amount, 0, isMint);
        }

        uint256 fees = 0; // amount paid in fees
        uint256 feeGap = 0; // amount that can be spent before higher fees

        bool isLongMintOrShortRedeem = isMint == isLong;
        if (isLongMintOrShortRedeem) {
            if (shortValue > longValue) {
                feeGap = shortValue - longValue;
            }
        } else {
            // long redeem or short mint
            if (longValue > shortValue) {
                feeGap = longValue - shortValue;
            }
        }

        // Case 1: fee gap is big enough that user pays no penalty fees
        if (feeGap >= amount) {
            return _getFeesForAmounts(marketIndex, amount, 0, isMint);
            // Case 2: user pays penalty fees on the remained after fee gap
        } else {
            return
                _getFeesForAmounts(
                    marketIndex,
                    amount,
                    amount.sub(feeGap),
                    isMint
                );
        }
    }

    ////////////////////////////////////
    /////////// MINT TOKENS ////////////
    ////////////////////////////////////

    /**
     * Create a long position
     */
    function mintLong(uint256 marketIndex, uint256 amount)
        external
        refreshSystemState(marketIndex)
    {
        // Deposit DAI and compute fees.
        _depositFunds(marketIndex, amount);
        uint256 fees =
            _getFeesForAction(
                marketIndex,
                amount,
                longValue[marketIndex],
                shortValue[marketIndex],
                true,
                true
            );
        uint256 remaining = amount.sub(fees);

        // TODO: decide on minting fees mechanism,
        _feesMechanism(marketIndex, fees, 50, 50);
        _refreshTokensPrice(marketIndex);

        // Mint long tokens with remaining value.
        uint256 tokens =
            remaining.mul(TEN_TO_THE_18).div(longTokenPrice[marketIndex]);
        longTokens[marketIndex].mint(msg.sender, tokens);
        longValue[marketIndex] = longValue[marketIndex].add(remaining);

        emit LongMinted(
            marketIndex,
            externalContractCounter[marketIndex],
            amount,
            remaining,
            tokens,
            msg.sender
        );
        emit ValueLockedInSystem(
            marketIndex,
            externalContractCounter[marketIndex],
            totalValueLockedInMarket[marketIndex],
            longValue[marketIndex],
            shortValue[marketIndex]
        );
    }

    /**
     * Creates a short position
     */
    function mintShort(uint256 marketIndex, uint256 amount)
        external
        refreshSystemState(marketIndex)
    {
        // Deposit DAI and compute fees.
        _depositFunds(marketIndex, amount);
        uint256 fees =
            _getFeesForAction(
                marketIndex,
                amount,
                longValue[marketIndex],
                shortValue[marketIndex],
                true,
                false
            );
        uint256 remaining = amount.sub(fees);

        // TODO: decide on minting fees mechanism.
        _feesMechanism(marketIndex, fees, 50, 50);
        _refreshTokensPrice(marketIndex);

        // Mint short tokens with remaining value.
        uint256 tokens =
            remaining.mul(TEN_TO_THE_18).div(shortTokenPrice[marketIndex]);
        shortTokens[marketIndex].mint(msg.sender, tokens);
        shortValue[marketIndex] = shortValue[marketIndex].add(remaining);

        emit ShortMinted(
            marketIndex,
            externalContractCounter[marketIndex],
            amount,
            remaining,
            tokens,
            msg.sender
        );

        emit ValueLockedInSystem(
            marketIndex,
            externalContractCounter[marketIndex],
            totalValueLockedInMarket[marketIndex],
            longValue[marketIndex],
            shortValue[marketIndex]
        );
    }

    ////////////////////////////////////
    /////////// REDEEM TOKENS //////////
    ////////////////////////////////////

    function redeemLong(uint256 marketIndex, uint256 tokensToRedeem)
        external
        refreshSystemState(marketIndex)
    {
        // Burn tokens - will revert unless user gives permission to contract.
        longTokens[marketIndex].burnFrom(msg.sender, tokensToRedeem);

        // Compute fees.
        uint256 amount =
            tokensToRedeem.mul(longTokenPrice[marketIndex]).div(TEN_TO_THE_18);
        uint256 fees =
            _getFeesForAction(
                marketIndex,
                amount,
                longValue[marketIndex],
                shortValue[marketIndex],
                false,
                true
            );
        uint256 remaining = amount.sub(fees);

        // TODO: decide on redeeming fees mechanism.
        _feesMechanism(marketIndex, fees, 50, 50);

        // Withdraw DAI with remaining amount.
        longValue[marketIndex] = longValue[marketIndex].sub(amount);
        _refreshTokensPrice(marketIndex);
        _withdrawFunds(marketIndex, remaining);

        emit LongRedeem(
            marketIndex,
            externalContractCounter[marketIndex],
            tokensToRedeem,
            amount,
            remaining,
            msg.sender
        );

        emit ValueLockedInSystem(
            marketIndex,
            externalContractCounter[marketIndex],
            totalValueLockedInMarket[marketIndex],
            longValue[marketIndex],
            shortValue[marketIndex]
        );
    }

    function redeemShort(uint256 marketIndex, uint256 tokensToRedeem)
        external
        refreshSystemState(marketIndex)
    {
        // Burn tokens - will revert unless user gives permission to contract.
        shortTokens[marketIndex].burnFrom(msg.sender, tokensToRedeem);

        // Compute fees.
        uint256 amount =
            tokensToRedeem.mul(shortTokenPrice[marketIndex]).div(TEN_TO_THE_18);
        uint256 fees =
            _getFeesForAction(
                marketIndex,
                amount,
                longValue[marketIndex],
                shortValue[marketIndex],
                false,
                false
            );
        uint256 remaining = amount.sub(fees);

        // TODO: decide on redeeming fees mechanism.
        _feesMechanism(marketIndex, fees, 50, 50);

        // Withdraw DAI with remaining amount.
        shortValue[marketIndex] = shortValue[marketIndex].sub(amount);
        _refreshTokensPrice(marketIndex);
        _withdrawFunds(marketIndex, remaining);

        emit ShortRedeem(
            marketIndex,
            externalContractCounter[marketIndex],
            tokensToRedeem,
            amount,
            remaining,
            msg.sender
        );

        emit ValueLockedInSystem(
            marketIndex,
            externalContractCounter[marketIndex],
            totalValueLockedInMarket[marketIndex],
            longValue[marketIndex],
            shortValue[marketIndex]
        );
    }
}
