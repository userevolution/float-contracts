const { BN } = require("@openzeppelin/test-helpers");
const { initialize, mintAndApprove, createSynthetic } = require("./helpers");

const erc20 = artifacts.require("SyntheticToken");

contract("LongShort (yield mechanism)", (accounts) => {
  let longShort;

  const syntheticName = "FTSE100";
  const syntheticSymbol = "FTSE";

  // Default test values
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];

  // Bignum utility constants.
  const fifty = new BN("50000000000000000000");
  const oneHundred = new BN("100000000000000000000");
  const oneHundredAndFifty = new BN("150000000000000000000");
  const twoHundred = new BN("200000000000000000000");
  const threeHundred = new BN("300000000000000000000");
  const fourHundred = new BN("400000000000000000000");

  beforeEach(async () => {
    var result = await initialize(admin);
    longShort = result.longShort;
  });

  // Generic test runner that checks whether the expected base and extra fee
  // amounts are correct for difference combinations of mints/redeems.
  function testMintFees(args) {
    return async () => {
      let {
        initialMintLong,
        initialMintShort,
        yieldFn,
        expectedShortValue,
        expectedLongValue,
        expectedDaoValue,
      } = args;

      // Create synthetic market.
      const synthResult = await createSynthetic(
        admin,
        longShort,
        syntheticName,
        syntheticSymbol,
        0, // no mint/redeem fees for testing yield
        0,
        0,
        0
      );

      // Variables for synthetic token queries.
      let fund = synthResult.fundToken;
      let long = synthResult.longToken;
      let short = synthResult.shortToken;
      let marketIndex = synthResult.currentMarketIndex;
      let yieldManager = synthResult.yieldManager;
      const yieldScale = await yieldManager.yieldScale.call();
      const yieldTokenAddress = await yieldManager.getHeldToken.call();
      const yieldToken = await erc20.at(yieldTokenAddress);

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

      // Ensure locked market value matches the amounts minted.
      const initialLongValue = await longShort.longValue.call(marketIndex);
      const initialShortValue = await longShort.shortValue.call(marketIndex);
      assert.equal(
        new BN(initialMintLong).toString(),
        initialLongValue.toString(),
        "wrong long value locked in market after initial mint"
      );
      assert.equal(
        new BN(initialMintShort),
        initialShortValue.toString(),
        "wrong short value locked in market after initial mint"
      );

      // Ensure value has been locked into the yield manager correctly.
      const initialMarketValue = await longShort.totalValueLockedInMarket.call(
        marketIndex
      );
      const initialYieldValue = await longShort.totalValueLockedInYieldManager.call(
        marketIndex
      );
      assert.equal(
        initialMarketValue.toString(),
        initialYieldValue.toString(),
        "wrong value locked into yield manager after initial mints"
      );

      // Ensure yield manager actually holds/bookkeeps the locked tokens.
      const initialYieldHeld = await yieldManager.getTotalHeld();
      const initialTokenHeld = await yieldToken.balanceOf(yieldManager.address);
      assert.equal(
        initialYieldValue.toString(),
        initialYieldHeld.toString(),
        "wrong value of tokens held in yield manager after initial mints"
      );
      assert.equal(
        initialYieldHeld.toString(),
        initialTokenHeld.toString(),
        "wrong number of tokens held in yield manager after initial mints"
      );

      // Accrue deterministic yield and update longshort system state.
      const yieldAmount = yieldFn(yieldScale);
      await yieldManager.settleWithYield(yieldAmount, {
        from: admin,
      });
      await longShort._updateSystemState(marketIndex);

      // Get changes in long/short value and check they match expectations.
      const longValue = await longShort.longValue.call(marketIndex);
      const shortValue = await longShort.shortValue.call(marketIndex);
      const daoValue = await longShort.totalValueLockedInDao.call(marketIndex);
      assert.equal(
        longValue.toString(),
        expectedLongValue.toString(),
        "long value didn't match expectation after settlement"
      );
      assert.equal(
        shortValue.toString(),
        expectedShortValue.toString(),
        "short value didn't match expectation after settlement"
      );
      assert.equal(
        daoValue.toString(),
        expectedDaoValue.toString(),
        "dao value didn't match expectation after settlement"
      );
    };
  }

  it(
    "handles balanced market with zero APY",
    testMintFees({
      initialMintLong: oneHundred,
      initialMintShort: oneHundred,
      yieldFn: (yieldScale) => new BN(0),
      expectedLongValue: oneHundred,
      expectedShortValue: oneHundred,
      expectedDaoValue: new BN(0),
    })
  );

  it(
    "handles imbalanced market with zero APY",
    testMintFees({
      initialMintLong: oneHundred,
      initialMintShort: twoHundred,
      yieldFn: (yieldScale) => new BN(0),
      expectedLongValue: oneHundred,
      expectedShortValue: twoHundred,
      expectedDaoValue: new BN(0),
    })
  );

  it(
    "handles imbalanced market with zero APY (flipped)",
    testMintFees({
      initialMintLong: twoHundred,
      initialMintShort: oneHundred,
      yieldFn: (yieldScale) => new BN(0),
      expectedLongValue: twoHundred,
      expectedShortValue: oneHundred,
      expectedDaoValue: new BN(0),
    })
  );

  it(
    "handles balanced market with non-zero APY",
    testMintFees({
      initialMintLong: oneHundred,
      initialMintShort: oneHundred,
      yieldFn: (yieldScale) => yieldScale, // 100%
      expectedLongValue: oneHundred,
      expectedShortValue: oneHundred,
      expectedDaoValue: twoHundred, // balanced - all yield goes to dao
    })
  );

  it(
    "handles totally imbalanced market with non-zero APY",
    testMintFees({
      initialMintLong: oneHundred,
      initialMintShort: new BN(0),
      yieldFn: (yieldScale) => yieldScale, // 100%
      expectedLongValue: oneHundredAndFifty, // all yield is split (TODO ACTUAL MECHANISM)
      expectedShortValue: fifty,
      expectedDaoValue: new BN(0), // no yield goes to dao
    })
  );

  it(
    "handles totally imbalanced market with non-zero APY (flipped)",
    testMintFees({
      initialMintLong: new BN(0),
      initialMintShort: oneHundred,
      yieldFn: (yieldScale) => yieldScale, // 100%
      expectedLongValue: fifty, // all yield is split (TODO ACTUAL MECHANISM)
      expectedShortValue: oneHundredAndFifty,
      expectedDaoValue: new BN(0), // no yield goes to dao
    })
  );

  it(
    "handles partially imbalanced market with non-zero APY",
    testMintFees({
      initialMintLong: oneHundred,
      initialMintShort: threeHundred,
      yieldFn: (yieldScale) => yieldScale, // 100%
      expectedLongValue: twoHundred, // 50% split to market (TODO ACTUAL MECHANISM)
      expectedShortValue: fourHundred,
      expectedDaoValue: twoHundred, // 50% split to dao
    })
  );

  it(
    "handles partially imbalanced market with non-zero APY (flipped)",
    testMintFees({
      initialMintLong: threeHundred,
      initialMintShort: oneHundred,
      yieldFn: (yieldScale) => yieldScale, // 100%
      expectedLongValue: fourHundred, // 50% split to market (TODO ACTUAL MECHANISM)
      expectedShortValue: twoHundred,
      expectedDaoValue: twoHundred, // 50% split to dao
    })
  );
});
