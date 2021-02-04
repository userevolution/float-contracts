//SPDX-License-Identifier: Unlicense
pragma solidity 0.6.12;

import "@nomiclabs/buidler/console.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";

import "./interfaces/IAaveLendingPool.sol";
import "./interfaces/IADai.sol";
import "./interfaces/ILendingPoolAddressesProvider.sol";

import "./LongCoins.sol";
import "./ShortCoins.sol";

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
    using SafeMath for uint256;
    // Oracle
    AggregatorV3Interface internal priceFeed;

    ////// Constants ///////
    uint256 public constant TEN_TO_THE_18 = 10**18;
    uint256 public constant feeUnitsOfPrecision = 10000; // [div the above by 10000]

    uint256 public constant contractValueWhenScalingFeesKicksIn = 10**23; // [above fee kicks in when contract >$100 000]
    uint256 public constant betaMultiplier = 10;

    // Fees for entering
    uint256 public baseEntryFee; // 0.1% [we div by 10000]
    uint256 public entryFeeMultiplier; // [= +1% fee for every 0.1 you tip the beta]
    uint256 public baseExitFee; // 0.5% [we div by 10000]
    uint256 public badLiquidityExitFee; // Extra charge for removing liquidity from the side with already less depth

    uint256 public totalValueLocked;
    // Value of the underlying from which we calculate
    // gains and losses by respective sides
    mapping(uint256 => uint256) public assetPrice;

    mapping(uint256 => uint256) public totalValueLockedInMarket;
    mapping(uint256 => uint256) public longValue;
    mapping(uint256 => uint256) public shortValue;

    // Tokens representing short and long position and cost at which
    // they can be minted or redeemed
    LongCoins public longTokens;
    ShortCoins public shortTokens;
    mapping(uint256 => uint256) public longTokenPrice;
    mapping(uint256 => uint256) public shortTokenPrice;

    // DEFI contracts
    IERC20 public daiContract;
    IAaveLendingPool public aaveLendingContract;
    IADai public adaiContract;
    ILendingPoolAddressesProvider public provider;
    address public aaveLendingContractCore;

    mapping(uint256 => uint256) public externalContractCounter;

    event ValueLockedInSystem(
        uint256 contractCallCounter,
        uint256 totalValueLockedInMarket,
        uint256 longValue,
        uint256 shortValue
    );
    event TokenPriceRefreshed(
        uint256 contractCallCounter,
        uint256 longTokenPrice,
        uint256 shortTokenPrice
    );
    event FeesLevied(
        uint256 contractCallCounter,
        uint256 totalFees,
        uint256 longPercentage,
        uint256 shortPercentage
    );
    event InterestDistribution(
        uint256 contractCallCounter,
        uint256 newtotalValueLockedInMarket,
        uint256 totalInterest,
        uint256 longPercentage,
        uint256 shortPercentage
    );
    event PriceUpdate(
        uint256 contractCallCounter,
        uint256 oldPrice,
        uint256 newPrice,
        address user
    );
    event LongMinted(
        uint256 contractCallCounter,
        uint256 depositAdded,
        uint256 finalDepositAmount,
        uint256 tokensMinted,
        address user
    );
    event ShortMinted(
        uint256 contractCallCounter,
        uint256 depositAdded,
        uint256 finalDepositAmount,
        uint256 tokensMinted,
        address user
    );
    event LongRedeem(
        uint256 contractCallCounter,
        uint256 tokensRedeemed,
        uint256 valueOfRedemption,
        uint256 finalRedeemValue,
        address user
    );
    event ShortRedeem(
        uint256 contractCallCounter,
        uint256 tokensRedeemed,
        uint256 valueOfRedemption,
        uint256 finalRedeemValue,
        address user
    );

    /**
     * Necessary to update system state before any contract actions (deposits / withdraws)
     */
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

    /**
     * Network: Kovan
     * Aggregator: BTC/USD
     * Address: 0x2445F2466898565374167859Ae5e3a231e48BB41
     * TODO: weigh up pros/cons of making this upgradable
     */
    function setup(
        address _longCoins,
        address _shortCoins,
        address daiAddress,
        address aDaiAddress,
        // lendingPoolAddressProvider should be one of below depending on deployment
        // kovan 0x506B0B2CF20FAA8f38a4E2B524EE43e1f4458Cc5
        // mainnet 0x24a42fD28C976A61Df5D00D0599C34c4f90748c8
        address lendingPoolAddressProvider,
        address _priceOracle,
        uint256 _baseEntryFee,
        uint256 _entryFeeMultiplier,
        uint256 _baseExitFee,
        uint256 _badLiquidityExitFee
    ) public initializer {
        priceFeed = AggregatorV3Interface(_priceOracle);

        // Will need to make sure we are a minter! and pauser!
        longTokens = LongCoins(_longCoins);
        shortTokens = ShortCoins(_shortCoins);

        daiContract = IERC20(daiAddress);
        provider = ILendingPoolAddressesProvider(lendingPoolAddressProvider);
        adaiContract = IADai(aDaiAddress);

        baseEntryFee = _baseEntryFee;
        entryFeeMultiplier = _entryFeeMultiplier;
        baseExitFee = _baseExitFee;
        badLiquidityExitFee = _badLiquidityExitFee;

        // Intialize price at $1 per token (adjust decimals)
        // TODO: we need to ensure 1 dai (18 decimals) =  1 longToken (18 decimals)
        // NB to ensure this is the case.
        // 1000000000000000
        // = 1 long token

        // TODO intitalize base market
        longTokenPrice[0] = TEN_TO_THE_18;
        shortTokenPrice[0] = TEN_TO_THE_18;
    }

    /**
     * Returns the latest price
     */
    function getLatestPrice() public view returns (int256) {
        (
            uint80 roundID,
            int256 price,
            uint256 startedAt,
            uint256 timeStamp,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();
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
     * Adjusts the relevant token price.
     */
    function _refreshTokensPrice(uint256 marketIndex) internal {
        uint256 longTokenSupply = longTokens.totalSupply();
        if (longTokenSupply > 0) {
            longTokenPrice[marketIndex] = longValue[marketIndex]
                .mul(TEN_TO_THE_18)
                .div(longTokens.totalSupply());
        }
        uint256 shortTokenSupply = shortTokens.totalSupply();
        if (shortTokenSupply > 0) {
            shortTokenPrice[marketIndex] = shortValue[marketIndex]
                .mul(TEN_TO_THE_18)
                .div(shortTokenSupply);
        }
        emit TokenPriceRefreshed(
            externalContractCounter[marketIndex],
            longTokenPrice[marketIndex],
            shortTokenPrice[marketIndex]
        );
    }

    /**
     * Fees for depositing or leaving the pool if you are not a
     * liquidity taker and not a liquidity maker...
     * This is v1 mechanism
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
            externalContractCounter[marketIndex],
            totalFees,
            longPercentage,
            shortPercentage
        );
    }

    /**
     * Generic function to add value to the system
     * Interest or fees
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
        updateCounterIfExternalCall(marketIndex)
    {
        if (longValue[marketIndex] == 0 && shortValue[marketIndex] == 0) {
            return;
        }

        // TODO: Check why/if this is bad (casting to uint)
        // If a negative int is return this should fail.
        uint256 newPrice = uint256(getLatestPrice());
        emit PriceUpdate(
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
            _priceChangeMechanism(assetPrice[marketIndex], newPrice);
        }

        // NB: RE ADD INTEREST MECHNAISM, INCLUDE GOVERNANCE TOKENS

        _refreshTokensPrice(marketIndex);
        assetPrice[marketIndex] = newPrice;

        emit ValueLockedInSystem(
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

    function _addDeposit(uint256 marketIndex, uint256 amount) internal {
        require(amount > 0, "User needs to add positive amount");
        aaveLendingContract = IAaveLendingPool(provider.getLendingPool());
        aaveLendingContractCore = provider.getLendingPoolCore();

        daiContract.transferFrom(msg.sender, address(this), amount);
        daiContract.approve(aaveLendingContractCore, amount);
        aaveLendingContract.deposit(address(daiContract), amount, 30);

        totalValueLockedInMarket[marketIndex] = totalValueLockedInMarket[
            marketIndex
        ]
            .add(amount);
    }

    function _feeCalc(
        uint256 marketIndex,
        uint256 fullAmount,
        uint256 feePayableAmount,
        uint256 betaDiff
    ) internal returns (uint256) {
        // 0.5% fee when contract has low liquidity
        uint256 fees =
            feePayableAmount.mul(baseEntryFee).div(feeUnitsOfPrecision);
        if (
            totalValueLockedInMarket[marketIndex] >
            contractValueWhenScalingFeesKicksIn
        ) {
            // 0.5% blanket fee + 1% for every 0.1 you dilute the beta!
            // Be careful the above system will rapidly decrease the rate at which the contract can be
            // grow quickly. Should let incentives guide this. No penalty on enterin at all ideally. Or
            // at least it should be a lot smaller.
            if (
                (totalValueLockedInMarket[marketIndex].sub(fullAmount)) <
                contractValueWhenScalingFeesKicksIn
            ) {
                feePayableAmount = totalValueLockedInMarket[marketIndex].sub(
                    contractValueWhenScalingFeesKicksIn
                );
            }

            uint256 additionalFees =
                feePayableAmount
                    .mul(betaDiff)
                    .mul(betaMultiplier)
                    .mul(entryFeeMultiplier)
                    .div(feeUnitsOfPrecision)
                    .div(TEN_TO_THE_18);

            fees = fees.add(additionalFees);
        }
        return fees;
    }

    /**
     * Calculates the final amount of deposit net of fees for imbalancing book liquidity
     * Takes into account the consideration where book liquidity is tipped from one side to the other
     */
    function _calcFinalDepositAmount(
        uint256 marketIndex,
        uint256 amount,
        uint256 newAdjustedBeta,
        uint256 oldBeta,
        bool isLong
    ) internal returns (uint256) {
        uint256 finalDepositAmount = 0;

        if (newAdjustedBeta >= TEN_TO_THE_18 || newAdjustedBeta == 0) {
            finalDepositAmount = amount;
        } else {
            uint256 fees = 0;
            uint256 depositLessFees = 0;
            if (oldBeta < TEN_TO_THE_18) {
                fees = _feeCalc(
                    marketIndex,
                    amount,
                    amount,
                    oldBeta.sub(newAdjustedBeta)
                );
            } else {
                // Case 2: Tipping/reversing imbalance. Only fees on tipping portion
                uint256 feePayablePortion = 0;
                if (isLong) {
                    feePayablePortion = amount.sub(
                        shortValue[marketIndex].sub(longValue[marketIndex])
                    );
                } else {
                    feePayablePortion = amount.sub(
                        longValue[marketIndex].sub(shortValue[marketIndex])
                    );
                }
                fees = _feeCalc(
                    marketIndex,
                    amount,
                    feePayablePortion,
                    TEN_TO_THE_18.sub(newAdjustedBeta)
                );
            }
            depositLessFees = amount.sub(fees);

            // Fees should not accrue this disproptionately!!!
            if (isLong) {
                _feesMechanism(marketIndex, fees, 0, 100);
            } else {
                _feesMechanism(marketIndex, fees, 100, 0);
            }
            finalDepositAmount = depositLessFees;
        }
        _refreshTokensPrice(marketIndex);
        return finalDepositAmount;
    }

    /**
     * Create a long position
     */
    function mintLong(uint256 marketIndex, uint256 amount)
        external
        refreshSystemState(marketIndex)
    {
        _addDeposit(marketIndex, amount);
        uint256 amountToMint = 0;
        uint256 longBeta = getLongBeta(marketIndex);
        uint256 newAdjustedBeta =
            shortValue[marketIndex].mul(TEN_TO_THE_18).div(
                longValue[marketIndex].add(amount)
            );
        uint256 finalDepositAmount =
            _calcFinalDepositAmount(
                marketIndex,
                amount,
                newAdjustedBeta,
                longBeta,
                true
            );

        amountToMint = finalDepositAmount.mul(TEN_TO_THE_18).div(
            longTokenPrice[marketIndex]
        );
        longValue[marketIndex] = longValue[marketIndex].add(finalDepositAmount);
        longTokens.mint(msg.sender, amountToMint);

        emit LongMinted(
            externalContractCounter[marketIndex],
            amount,
            finalDepositAmount,
            amountToMint,
            msg.sender
        );
        emit ValueLockedInSystem(
            externalContractCounter[marketIndex],
            totalValueLockedInMarket[marketIndex],
            longValue[marketIndex],
            shortValue[marketIndex]
        );
        // Safety Checks
        // Again consider gas implications.
        require(
            longTokenPrice[marketIndex] ==
                longValue[marketIndex].mul(TEN_TO_THE_18).div(
                    longTokens.totalSupply()
                ),
            "Mint affecting price changed (long)"
        );
        require(
            longValue[marketIndex].add(shortValue[marketIndex]) ==
                totalValueLockedInMarket[marketIndex],
            "Total locked inconsistent"
        );
    }

    /**
     * Creates a short position
     */
    function mintShort(uint256 marketIndex, uint256 amount)
        external
        refreshSystemState(marketIndex)
    {
        _addDeposit(marketIndex, amount);
        uint256 amountToMint = 0;
        //uint256 finalDepositAmount = 0;
        uint256 shortBeta = getShortBeta(marketIndex);
        uint256 newAdjustedBeta =
            longValue[marketIndex].mul(TEN_TO_THE_18).div(
                shortValue[marketIndex].add(amount)
            );
        uint256 finalDepositAmount =
            _calcFinalDepositAmount(
                marketIndex,
                amount,
                newAdjustedBeta,
                shortBeta,
                false
            );

        amountToMint = finalDepositAmount.mul(TEN_TO_THE_18).div(
            shortTokenPrice[marketIndex]
        );
        shortValue[marketIndex] = shortValue[marketIndex].add(
            finalDepositAmount
        );
        shortTokens.mint(msg.sender, amountToMint);

        // NB : Important to refresh the token price before claculating amount to mint?
        // So user is buying them at the new price after their fee has increased the price.

        emit ShortMinted(
            externalContractCounter[marketIndex],
            amount,
            finalDepositAmount,
            amountToMint,
            msg.sender
        );

        emit ValueLockedInSystem(
            externalContractCounter[marketIndex],
            totalValueLockedInMarket[marketIndex],
            longValue[marketIndex],
            shortValue[marketIndex]
        );
        // Safety Checks
        require(
            shortTokenPrice[marketIndex] ==
                shortValue[marketIndex].mul(TEN_TO_THE_18).div(
                    shortTokens.totalSupply()
                ),
            "Mint affecting price changed (short)"
        );
        require(
            longValue[marketIndex].add(shortValue[marketIndex]) ==
                totalValueLockedInMarket[marketIndex],
            "Total locked inconsistent"
        );
    }

    function _redeem(uint256 marketIndex, uint256 amount) internal {
        totalValueLockedInMarket[marketIndex] = totalValueLockedInMarket[
            marketIndex
        ]
            .sub(amount);

        try adaiContract.redeem(amount) {
            daiContract.transfer(msg.sender, amount);
        } catch {
            adaiContract.transfer(msg.sender, amount);
        }
    }

    /**
     * 0.5% fee + extra 0.5% on amount of bad liquidity leaving
     */
    function _feeCalcRedeem(
        uint256 marketIndex,
        uint256 fullAmount,
        uint256 feePayableAmount
    ) internal returns (uint256) {
        // base 0.5% fee
        uint256 fees = fullAmount.mul(baseExitFee).div(feeUnitsOfPrecision);

        // Extra 0.5% fee on deisrable liquidity leaving the book
        uint256 additionalFees =
            feePayableAmount.mul(badLiquidityExitFee).div(feeUnitsOfPrecision);

        return fees.add(additionalFees);
    }

    function _calcFinalRedeemAmount(
        uint256 marketIndex,
        uint256 amount,
        uint256 newAdjustedBeta, // 0.5
        uint256 oldBeta, // 1
        bool isLong
    ) internal returns (uint256) {
        uint256 fees = 0;
        uint256 finalRedeemAmount = 0;

        if (newAdjustedBeta >= TEN_TO_THE_18) {
            fees = _feeCalcRedeem(marketIndex, amount, 0);
        } else {
            if (oldBeta >= TEN_TO_THE_18) {
                uint256 feePayablePortion = 0;
                if (isLong) {
                    feePayablePortion = amount.add(shortValue[marketIndex]).sub(
                        longValue[marketIndex]
                    );
                } else {
                    feePayablePortion = amount.add(longValue[marketIndex]).sub(
                        shortValue[marketIndex]
                    );
                }
                fees = _feeCalcRedeem(marketIndex, amount, feePayablePortion);
            } else {
                // All is bad liquidity leaving the book.
                fees = _feeCalcRedeem(marketIndex, amount, amount);
            }
        }
        finalRedeemAmount = amount.sub(fees);
        _feesMechanism(marketIndex, fees, 50, 50);

        return finalRedeemAmount;
    }

    // TODO: REDO redeem function with similair advanced fees strategy to minting functions.
    function redeemLong(uint256 marketIndex, uint256 tokensToRedeem)
        external
        refreshSystemState(marketIndex)
    {
        // This will revert unless user gives permission to contract to burn these tokens.
        longTokens.burnFrom(msg.sender, tokensToRedeem);

        uint256 shortBeta = getShortBeta(marketIndex);
        uint256 newAdjustedShortBeta = 0;
        uint256 amountToRedeem =
            tokensToRedeem.mul(longTokenPrice[marketIndex]).div(TEN_TO_THE_18);

        newAdjustedShortBeta = (longValue[marketIndex].sub(amountToRedeem))
            .mul(TEN_TO_THE_18)
            .div(shortValue[marketIndex]);

        uint256 finalRedeemAmount =
            _calcFinalRedeemAmount(
                marketIndex,
                amountToRedeem,
                newAdjustedShortBeta,
                shortBeta,
                true
            );

        longValue[marketIndex] = longValue[marketIndex].sub(amountToRedeem);
        _refreshTokensPrice(marketIndex);
        _redeem(marketIndex, finalRedeemAmount);

        emit LongRedeem(
            externalContractCounter[marketIndex],
            tokensToRedeem,
            amountToRedeem,
            finalRedeemAmount,
            msg.sender
        );

        emit ValueLockedInSystem(
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
        shortTokens.burnFrom(msg.sender, tokensToRedeem); // burning 50 tokens

        uint256 longBeta = getLongBeta(marketIndex);
        uint256 newAdjustedLongBeta = 0;
        uint256 amountToRedeem =
            tokensToRedeem.mul(shortTokenPrice[marketIndex]).div(TEN_TO_THE_18);

        newAdjustedLongBeta = (shortValue[marketIndex].sub(amountToRedeem))
            .mul(TEN_TO_THE_18)
            .div(longValue[marketIndex]);

        uint256 finalRedeemAmount =
            _calcFinalRedeemAmount(
                marketIndex,
                amountToRedeem,
                newAdjustedLongBeta,
                longBeta,
                false
            );

        shortValue[marketIndex] = shortValue[marketIndex].sub(amountToRedeem);
        _refreshTokensPrice(marketIndex);
        _redeem(marketIndex, finalRedeemAmount);

        emit ShortRedeem(
            externalContractCounter[marketIndex],
            tokensToRedeem,
            amountToRedeem,
            finalRedeemAmount,
            msg.sender
        );

        emit ValueLockedInSystem(
            externalContractCounter[marketIndex],
            totalValueLockedInMarket[marketIndex],
            longValue[marketIndex],
            shortValue[marketIndex]
        );
    }
}
