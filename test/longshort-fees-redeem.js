const {
  BN,
  expectRevert,
  ether,
  expectEvent,
  balance,
  time,
} = require("@openzeppelin/test-helpers");

const {
  initialize,
  mintAndApprove,
  SIMULATED_INSTANT_APY,
  simulateInterestEarned,
  tokenPriceCalculator,
  simulateTotalValueWithInterest,
  feeCalculation,
  initializeWithFeeArguments,
} = require("./helpers");

contract("LongShort", (accounts) => {
  let longShort;
  let long;
  let short;
  let dai;
  let priceOracle;
  let aaveLendingPool;
  let baseExitFee;
  let badLiquidityExitFee;

  // Default test values
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  const user3 = accounts[3];

  const _baseEntryFee = 0;
  const _entryFeeMultiplier = 0;
  const _baseExitFee = 50;
  const _badLiquidityExitFee = 50;

  const oneHundredMintAmount = "100000000000000000000";
  const twoHundredMintAmount = "200000000000000000000";

  beforeEach(async () => {
    const result = await initializeWithFeeArguments(
      admin,
      _baseEntryFee,
      _entryFeeMultiplier,
      _baseExitFee,
      _badLiquidityExitFee
    );
    longShort = result.longShort;
    long = result.long;
    short = result.short;
    dai = result.dai;
    priceOracle = result.priceOracle;
    aaveLendingPool = result.aaveLendingPool;

    // Variables for exit fees.
    baseExitFee = await longShort.baseExitFee.call();
    badLiquidityExitFee = await longShort.badLiquidityExitFee.call();
    feeUnitsOfPrecision = await longShort.feeUnitsOfPrecision.call();

    getShortBeta = async () => await longShort.getShortBeta.call();
    getLongBeta = async () => await longShort.getLongBeta.call();
  });

  // Case 1: Only 0.5%, good removal
  // Case 2: 0.5% * 2 on full amount, bad removal
  // Case 3: Partial bad removal 0.5% on part, + extra 0.5% on bad part.
  // Other edge cases to test: liquidity only on one side etc...

  // Notes fees accrue with a 50/50 split. NB we think about what we prefer.

  it("Exit fees 0.5% only when improving liquidity", async () => {
    // $100 on long side.
    await mintAndApprove(dai, oneHundredMintAmount, user1, longShort.address);
    await longShort.mintLong(new BN(oneHundredMintAmount), { from: user1 });

    // $200 on short side.
    await mintAndApprove(dai, twoHundredMintAmount, user2, longShort.address);
    await longShort.mintShort(new BN(twoHundredMintAmount), { from: user2 });

    // Redeem 100 tokens from user, check the fee.
    await short.increaseAllowance(longShort.address, oneHundredMintAmount, {
      from: user2,
    });
    await longShort.redeemShort(new BN(oneHundredMintAmount), { from: user2 });

    // We can expect the fee to be the following
    const usersBalanceOfDai = await dai.balanceOf(user2);
    const usersFee = new BN(oneHundredMintAmount).sub(usersBalanceOfDai);

    const totalValueInContract = await longShort.totalValueLocked.call();
    const totalExpectedValueInContract = new BN(twoHundredMintAmount).add(
      usersFee
    );
    assert.equal(
      totalValueInContract.toString(),
      totalExpectedValueInContract.toString(),
      "Total fee not taken correct."
    );

    // const shortValueLocked = await longShort.shortValue.call();
    // const shortValueExpected = 0;
    // assert.equal(
    //   shortValueLocked.toString(),
    //   shortValueExpected.toString(),
    //   "Short value not correctly shown"
    // );
  });
});
