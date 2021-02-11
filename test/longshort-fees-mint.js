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

  const syntheticName = "FTSE100";
  const syntheticSymbol = "FTSE";

  // Default test values
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  const user3 = accounts[3];

  const fifty = "50000000000000000000";
  const oneHundred = "100000000000000000000";
  const oneHundredAndFifty = "150000000000000000000";
  const twoHundred = "200000000000000000000";
  const e18 = new BN("1000000000000000000");

  beforeEach(async () => {
    const result = await initialize(admin);
    longShort = result.longShort;
  });

  // Generic test runner that checks whether the expected base and extra fee
  // amounts are correct for difference combinations of mints/redeems.
  function testMintFees(args) {
    return async () => {
      let {
        baseFee,
        penaltyFee,
        initialMintLong,
        initialMintShort,
        mintLong,
        mintShort,
        expectedBaseFeeAmount,
        expectedPenaltyFeeAmount,
      } = args;

      assert.isTrue(
        mintLong == 0 || mintShort == 0,
        "Test should only mint on one side of the market"
      );

      // Create synthetic market.
      const synthResult = await createSynthetic(
        admin,
        longShort,
        syntheticName,
        syntheticSymbol,
        baseFee,
        penaltyFee,
        0, // redeem base fee
        0 // redeem penalty fee
      );

      // Variables for synthetic token queries.
      let fund = synthResult.fundToken;
      let long = synthResult.longToken;
      let short = synthResult.shortToken;
      let marketIndex = synthResult.currentMarketIndex;

      // Variables for mint fees.
      baseFee = await longShort.baseEntryFee.call(marketIndex);
      penaltyFee = await longShort.badLiquidityEntryFee.call(marketIndex);
      let feeUnitsOfPrecision = await longShort.feeUnitsOfPrecision.call();

      // Mint the initial long tokens.
      if (initialMintLong != 0) {
        await mintAndApprove(fund, initialMintLong, user1, longShort.address);
        await longShort.mintLong(marketIndex, new BN(initialMintLong), {
          from: user1,
        });
      }

      // Mint the initial short tokens.
      if (initialMintShort != 0) {
        await mintAndApprove(fund, initialMintShort, user2, longShort.address);
        await longShort.mintShort(marketIndex, new BN(initialMintShort), {
          from: user2,
        });
      }

      // Get locked value for initial mints (fees may have been taken):
      const initialLongValue = await longShort.longValue.call(marketIndex);
      const initialShortValue = await longShort.shortValue.call(marketIndex);

      // Verify that the locked-in value increased by the amount minted.
      // NOTE: this may change if we change our fee mechanism, as currently we
      //       split fees across the long/short value in the market.
      assert.equal(
        new BN(initialLongValue).add(new BN(initialShortValue)).toString(),
        new BN(initialMintLong).add(new BN(initialMintShort)).toString(),
        "Wrong value locked in market after initial mint."
      );

      // Mint the long tokens.
      if (mintLong != 0) {
        await mintAndApprove(fund, mintLong, user1, longShort.address);
        await longShort.mintLong(marketIndex, new BN(mintLong), {
          from: user1,
        });
      }

      // Mint the short tokens.
      if (mintShort != 0) {
        await mintAndApprove(fund, mintShort, user2, longShort.address);
        await longShort.mintShort(marketIndex, new BN(mintShort), {
          from: user2,
        });
      }

      // Compute fee paid by user.
      // NOTE: may change if we change the fee mechanism, this code relies on
      // the fee being split across both sides of the market.
      let userFee;
      const finalLongValue = await longShort.longValue.call(marketIndex);
      const finalShortValue = await longShort.shortValue.call(marketIndex);
      const diffLongValue = finalLongValue.sub(initialLongValue);
      const diffShortValue = finalShortValue.sub(initialShortValue);
      if (mintLong != 0) {
        userFee = new BN(mintLong).sub(diffLongValue).add(diffShortValue);
      } else {
        userFee = new BN(mintShort).sub(diffShortValue).add(diffLongValue);
      }

      // Check that the fees match what was expected.
      const expectedBaseFee = baseFee
        .mul(new BN(expectedBaseFeeAmount))
        .div(feeUnitsOfPrecision);
      const expectedPenaltyFee = penaltyFee
        .mul(new BN(expectedPenaltyFeeAmount))
        .div(feeUnitsOfPrecision);
      assert.equal(
        userFee.toString(),
        expectedBaseFee.add(expectedPenaltyFee).toString(),
        "Fees were not calculated correctly."
      );
    };
  }

  it(
    "case 1: no penalties when minting in new market",
    testMintFees({
      baseFee: 50,
      penaltyFee: 50,
      initialMintLong: 0,
      initialMintShort: 0,
      mintLong: oneHundred,
      mintShort: 0,
      expectedBaseFeeAmount: oneHundred,
      expectedPenaltyFeeAmount: 0,
    })
  );

  it(
    "case 1: no penalties when minting in new market (flipped)",
    testMintFees({
      baseFee: 50,
      penaltyFee: 50,
      initialMintLong: 0,
      initialMintShort: 0,
      mintLong: 0,
      mintShort: oneHundred,
      expectedBaseFeeAmount: oneHundred,
      expectedPenaltyFeeAmount: 0,
    })
  );

  it(
    "case 1: no penalties when minting in 1-sided market",
    testMintFees({
      baseFee: 0, // 0 else fees get split and it's no longer 1-sided
      penaltyFee: 50,
      initialMintLong: oneHundred,
      initialMintShort: 0,
      mintLong: oneHundred,
      mintShort: 0,
      expectedBaseFeeAmount: oneHundred,
      expectedPenaltyFeeAmount: 0,
    })
  );

  it(
    "case 1: no penalties when minting in 1-sided market (flipped)",
    testMintFees({
      baseFee: 0, // 0 else fees get split and it's no longer 1-sided
      penaltyFee: 50,
      initialMintLong: 0,
      initialMintShort: oneHundred,
      mintLong: 0,
      mintShort: oneHundred,
      expectedBaseFeeAmount: oneHundred,
      expectedPenaltyFeeAmount: 0,
    })
  );

  it(
    "case 2: penalty fees when completely imbalancing market",
    testMintFees({
      baseFee: 0,
      penaltyFee: 50,
      initialMintLong: oneHundred,
      initialMintShort: oneHundred,
      mintLong: oneHundred,
      mintShort: 0,
      expectedBaseFeeAmount: oneHundred,
      expectedPenaltyFeeAmount: oneHundred,
    })
  );

  it(
    "case 2: penalty fees when completely imbalancing market (flipped)",
    testMintFees({
      baseFee: 0,
      penaltyFee: 50,
      initialMintLong: oneHundred,
      initialMintShort: oneHundred,
      mintLong: 0,
      mintShort: oneHundred,
      expectedBaseFeeAmount: oneHundred,
      expectedPenaltyFeeAmount: oneHundred,
    })
  );

  it(
    "case 2: penalty fees when partially imbalancing market",
    testMintFees({
      baseFee: 0,
      penaltyFee: 50,
      initialMintLong: fifty,
      initialMintShort: oneHundred,
      mintLong: oneHundred,
      mintShort: 0,
      expectedBaseFeeAmount: oneHundred,
      expectedPenaltyFeeAmount: fifty,
    })
  );

  it(
    "case 2: penalty fees when partially imbalancing market (flipped)",
    testMintFees({
      baseFee: 0,
      penaltyFee: 50,
      initialMintLong: oneHundred,
      initialMintShort: fifty,
      mintLong: 0,
      mintShort: oneHundred,
      expectedBaseFeeAmount: oneHundred,
      expectedPenaltyFeeAmount: fifty,
    })
  );
});
