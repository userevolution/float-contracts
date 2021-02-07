const {
  BN,
  expectRevert,
  ether,
  expectEvent,
  balance,
  time,
} = require("@openzeppelin/test-helpers");

const { initialize, mintAndApprove, createSynthetic } = require("./helpers");

contract("LongShort", (accounts) => {
  let longShort;
  let long;
  let short;
  let dai;
  let priceOracle;
  let marketIndex;

  const syntheticName = "FTSE100";
  const syntheticSymbol = "FTSE";

  // Fees
  const _baseEntryFee = 0;
  const _badLiquidityEntryFee = 0;
  const _baseExitFee = 50;
  const _badLiquidityExitFee = 50;

  // Default test values
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  const user3 = accounts[3];

  const oneHundredMintAmount = "100000000000000000000";
  const oneHundredAndFiftyMintAmount = "150000000000000000000";
  const twoHundredMintAmount = "200000000000000000000";

  beforeEach(async () => {
    const result = await initialize(admin);
    longShort = result.longShort;
    dai = result.dai;

    const synthResult = await createSynthetic(
      admin,
      longShort,
      syntheticName,
      syntheticSymbol,
      _baseEntryFee,
      _badLiquidityEntryFee,
      _baseExitFee,
      _badLiquidityExitFee
    );

    long = synthResult.long;
    short = synthResult.short;
    priceOracle = synthResult.oracle;
    marketIndex = synthResult.currentMarketIndex;

    // Variables for exit fees.
    baseExitFee = await longShort.baseExitFee.call(marketIndex);
    badLiquidityExitFee = await longShort.badLiquidityExitFee.call(marketIndex);
    feeUnitsOfPrecision = await longShort.feeUnitsOfPrecision.call();

    getShortBeta = async () => await longShort.getShortBeta.call(marketIndex);
    getLongBeta = async () => await longShort.getLongBeta.call(marketIndex);
  });

  // Case 1: Only 0.5%, good removal
  // Case 2: 0.5% * 2 on full amount, bad removal
  // Case 3: Partial bad removal 0.5% on part, + extra 0.5% on bad part.
  // Other edge cases to test: liquidity only on one side etc...

  // Notes fees accrue with a 50/50 split. NB we think about what we prefer.
  // TEST this later.

  it("Case 1: Exit fees 0.5% only when improving liquidity", async () => {
    // $100 on long side.
    await mintAndApprove(dai, oneHundredMintAmount, user1, longShort.address);
    await longShort.mintLong(marketIndex, new BN(oneHundredMintAmount), {
      from: user1,
    });

    // $200 on short side.
    await mintAndApprove(dai, twoHundredMintAmount, user2, longShort.address);
    await longShort.mintShort(marketIndex, new BN(twoHundredMintAmount), {
      from: user2,
    });

    // Check long and short values and correct in contract.
    const longValueInContract = await longShort.longValue.call(marketIndex);
    const expectedLongValueInContract = new BN(oneHundredMintAmount);
    assert.equal(
      longValueInContract.toString(),
      expectedLongValueInContract.toString(),
      "Long locked not correct."
    );

    const shortValueInContract = await longShort.shortValue.call(marketIndex);
    const expectedShortValueInContract = new BN(twoHundredMintAmount);
    assert.equal(
      shortValueInContract.toString(),
      expectedShortValueInContract.toString(),
      "Short locked not correct."
    );

    // Redeem 100 tokens from user, check the fee.
    await short.increaseAllowance(longShort.address, oneHundredMintAmount, {
      from: user2,
    });
    // User wants to redeem half his tokens.
    await longShort.redeemShort(marketIndex, new BN(oneHundredMintAmount), {
      from: user2,
    });

    // We can expect the fee to be the following
    const usersBalanceOfaDai = await dai.balanceOf(user2);

    const usersFee = new BN(oneHundredMintAmount).sub(usersBalanceOfaDai);
    const baseFeeAmount = baseExitFee
      .mul(new BN(oneHundredMintAmount))
      .div(feeUnitsOfPrecision);
    const badExitFeeAmount = badLiquidityExitFee
      .mul(new BN(0))
      .div(feeUnitsOfPrecision);

    const totalExpectedFee = baseFeeAmount.add(badExitFeeAmount);

    assert.equal(
      usersFee.toString(),
      totalExpectedFee.toString(),
      "Fee not calculated correctly."
    );

    const totalValueInContract = await longShort.totalValueLockedInMarket.call(
      marketIndex
    );
    const totalExpectedValueInContract = new BN(twoHundredMintAmount).add(
      usersFee
    );
    assert.equal(
      totalValueInContract.toString(),
      totalExpectedValueInContract.toString(),
      "Total fee not taken correct."
    );
  });

  it("Case 2: Exit fees 2 * 0.5% for bad removal", async () => {
    // $100 on long side.
    await mintAndApprove(dai, oneHundredMintAmount, user1, longShort.address);
    await longShort.mintLong(marketIndex, new BN(oneHundredMintAmount), {
      from: user1,
    });

    // $200 on short side.
    await mintAndApprove(dai, twoHundredMintAmount, user2, longShort.address);
    await longShort.mintShort(marketIndex, new BN(twoHundredMintAmount), {
      from: user2,
    });

    // Redeem 100 tokens from user, check the fee.
    await long.increaseAllowance(longShort.address, oneHundredMintAmount, {
      from: user1,
    });
    // User wants to redeem half the long tokens.
    await longShort.redeemLong(marketIndex, new BN(oneHundredMintAmount), {
      from: user1,
    });

    // We can expect the fee to be the following
    const usersBalanceOfaDai = await dai.balanceOf(user1);

    const usersFee = new BN(oneHundredMintAmount).sub(usersBalanceOfaDai);
    const baseFeeAmount = baseExitFee
      .mul(new BN(oneHundredMintAmount))
      .div(feeUnitsOfPrecision);
    const badExitFeeAmount = badLiquidityExitFee
      .mul(new BN(oneHundredMintAmount))
      .div(feeUnitsOfPrecision);

    const totalExpectedFee = baseFeeAmount.add(badExitFeeAmount);

    assert.equal(
      usersFee.toString(),
      totalExpectedFee.toString(),
      "Fee not calculated correctly."
    );

    const totalValueInContract = await longShort.totalValueLockedInMarket.call(
      marketIndex
    );
    const totalExpectedValueInContract = new BN(twoHundredMintAmount).add(
      usersFee
    );

    assert.equal(
      totalValueInContract.toString(),
      totalExpectedValueInContract.toString(),
      "Total fee not taken correct."
    );
  });

  it("Case 3: Exit fees are partially applied to bad liquidity removed.", async () => {
    // $100 on long side.
    await mintAndApprove(dai, oneHundredMintAmount, user1, longShort.address);
    await longShort.mintLong(marketIndex, new BN(oneHundredMintAmount), {
      from: user1,
    });

    // $200 on short side.
    await mintAndApprove(dai, twoHundredMintAmount, user2, longShort.address);
    await longShort.mintShort(marketIndex, new BN(twoHundredMintAmount), {
      from: user2,
    });

    await short.increaseAllowance(longShort.address, twoHundredMintAmount, {
      from: user2,
    });

    // so $150 redeemed is good liquidity while $50 is bad.
    await longShort.redeemShort(
      marketIndex,
      new BN(oneHundredAndFiftyMintAmount),
      {
        from: user2,
      }
    );

    // We can expect the fee to be the following
    const usersBalanceOfaDai = await dai.balanceOf(user2);

    const usersFee = new BN(oneHundredAndFiftyMintAmount).sub(
      usersBalanceOfaDai
    );

    const baseFeeAmount = baseExitFee
      .mul(new BN(oneHundredAndFiftyMintAmount))
      .div(feeUnitsOfPrecision);

    const badExitFeeAmount = badLiquidityExitFee
      .mul(new BN("50000000000000000000"))
      .div(feeUnitsOfPrecision);

    const totalExpectedFee = baseFeeAmount.add(badExitFeeAmount);

    assert.equal(
      usersFee.toString(),
      totalExpectedFee.toString(),
      "Fee not calculated correctly."
    );

    const totalValueInContract = await longShort.totalValueLockedInMarket.call(
      marketIndex
    );
    const totalExpectedValueInContract = new BN(
      oneHundredAndFiftyMintAmount
    ).add(usersFee);

    assert.equal(
      totalValueInContract.toString(),
      totalExpectedValueInContract.toString(),
      "Total fee not taken correct."
    );
  });

  // Test Above 3 cases in other direction.
  it("Case 1 (other side): Exit fees 0.5% only when improving liquidity", async () => {
    // $100 on long side.
    await mintAndApprove(dai, twoHundredMintAmount, user1, longShort.address);
    await longShort.mintLong(marketIndex, new BN(twoHundredMintAmount), {
      from: user1,
    });

    // $200 on short side.
    await mintAndApprove(dai, oneHundredMintAmount, user2, longShort.address);
    await longShort.mintShort(marketIndex, new BN(oneHundredMintAmount), {
      from: user2,
    });

    // Redeem 100 tokens from user, check the fee.
    await long.increaseAllowance(longShort.address, oneHundredMintAmount, {
      from: user1,
    });
    // User wants to redeem half his tokens.
    await longShort.redeemLong(marketIndex, new BN(oneHundredMintAmount), {
      from: user1,
    });

    // We can expect the fee to be the following
    const usersBalanceOfaDai = await dai.balanceOf(user1);

    const usersFee = new BN(oneHundredMintAmount).sub(usersBalanceOfaDai);
    const baseFeeAmount = baseExitFee
      .mul(new BN(oneHundredMintAmount))
      .div(feeUnitsOfPrecision);
    const badExitFeeAmount = badLiquidityExitFee
      .mul(new BN(0))
      .div(feeUnitsOfPrecision);

    const totalExpectedFee = baseFeeAmount.add(badExitFeeAmount);

    assert.equal(
      usersFee.toString(),
      totalExpectedFee.toString(),
      "Fee not calculated correctly."
    );

    const totalValueInContract = await longShort.totalValueLockedInMarket.call(
      marketIndex
    );
    const totalExpectedValueInContract = new BN(twoHundredMintAmount).add(
      usersFee
    );
    assert.equal(
      totalValueInContract.toString(),
      totalExpectedValueInContract.toString(),
      "Total fee not taken correct."
    );

    // Check long and short values and equal since interest should accrue equally
    const longValueInContract = await longShort.longValue.call(marketIndex);
    const shortValueInContract = await longShort.shortValue.call(marketIndex);
    assert.equal(
      shortValueInContract.toString(),
      longValueInContract.toString(),
      "Interest accrual not equal"
    );
  });

  it("Case 2 (other side): Exit fees 2 * 0.5% for bad removal", async () => {
    // $100 on long side.
    await mintAndApprove(dai, twoHundredMintAmount, user1, longShort.address);
    await longShort.mintLong(marketIndex, new BN(twoHundredMintAmount), {
      from: user1,
    });

    // $200 on short side.
    await mintAndApprove(dai, oneHundredMintAmount, user2, longShort.address);
    await longShort.mintShort(marketIndex, new BN(oneHundredMintAmount), {
      from: user2,
    });

    // Redeem 100 tokens from user, check the fee.
    await short.increaseAllowance(longShort.address, oneHundredMintAmount, {
      from: user2,
    });
    // User wants to redeem half the long tokens.
    await longShort.redeemShort(marketIndex, new BN(oneHundredMintAmount), {
      from: user2,
    });

    // We can expect the fee to be the following
    const usersBalanceOfaDai = await dai.balanceOf(user2);

    const usersFee = new BN(oneHundredMintAmount).sub(usersBalanceOfaDai);
    const baseFeeAmount = baseExitFee
      .mul(new BN(oneHundredMintAmount))
      .div(feeUnitsOfPrecision);
    const badExitFeeAmount = badLiquidityExitFee
      .mul(new BN(oneHundredMintAmount))
      .div(feeUnitsOfPrecision);

    const totalExpectedFee = baseFeeAmount.add(badExitFeeAmount);

    assert.equal(
      usersFee.toString(),
      totalExpectedFee.toString(),
      "Fee not calculated correctly."
    );

    const totalValueInContract = await longShort.totalValueLockedInMarket.call(
      marketIndex
    );
    const totalExpectedValueInContract = new BN(twoHundredMintAmount).add(
      usersFee
    );

    assert.equal(
      totalValueInContract.toString(),
      totalExpectedValueInContract.toString(),
      "Total fee not taken correct."
    );
  });

  it("Case 3 (other side): Exit fees are partially applied to bad liquidity removed.", async () => {
    // $100 on long side.
    await mintAndApprove(dai, twoHundredMintAmount, user1, longShort.address);
    await longShort.mintLong(marketIndex, new BN(twoHundredMintAmount), {
      from: user1,
    });

    // $200 on short side.
    await mintAndApprove(dai, oneHundredMintAmount, user2, longShort.address);
    await longShort.mintShort(marketIndex, new BN(oneHundredMintAmount), {
      from: user2,
    });

    await long.increaseAllowance(longShort.address, twoHundredMintAmount, {
      from: user1,
    });

    // so $150 redeemed is good liquidity while $50 is bad.
    await longShort.redeemLong(
      marketIndex,
      new BN(oneHundredAndFiftyMintAmount),
      {
        from: user1,
      }
    );

    // We can expect the fee to be the following
    const usersBalanceOfaDai = await dai.balanceOf(user1);

    const usersFee = new BN(oneHundredAndFiftyMintAmount).sub(
      usersBalanceOfaDai
    );

    const baseFeeAmount = baseExitFee
      .mul(new BN(oneHundredAndFiftyMintAmount))
      .div(feeUnitsOfPrecision);

    const badExitFeeAmount = badLiquidityExitFee
      .mul(new BN("50000000000000000000"))
      .div(feeUnitsOfPrecision);

    const totalExpectedFee = baseFeeAmount.add(badExitFeeAmount);

    assert.equal(
      usersFee.toString(),
      totalExpectedFee.toString(),
      "Fee not calculated correctly."
    );

    const totalValueInContract = await longShort.totalValueLockedInMarket.call(
      marketIndex
    );
    const totalExpectedValueInContract = new BN(
      oneHundredAndFiftyMintAmount
    ).add(usersFee);

    assert.equal(
      totalValueInContract.toString(),
      totalExpectedValueInContract.toString(),
      "Total fee not taken correct."
    );
  });
});
