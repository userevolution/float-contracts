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
  let priceOracle;
  let marketIndex;
  let long;
  let short;
  let fund;

  const syntheticName = "FTSE100";
  const syntheticSymbol = "FTSE";

  // Fees
  const _baseEntryFee = 0;
  const _badLiquidityEntryFee = 0;
  const _baseExitFee = 50;
  const _badLiquidityExitFee = 50;

  const defaultMintAmount = "100000000000000000000"; // 100 fund etc.

  const ninetyPercentDefaultMintAmount = "90000000000000000000";
  const hundredTenPercentDefaultMintAmount = "110000000000000000000";

  const tenPercentMovement = "100000000000000000";
  const hundredPercentMovement = "1000000000000000000";

  // Default test values
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  const user3 = accounts[3];

  beforeEach(async () => {
    const result = await initialize(admin);
    longShort = result.longShort;
    priceOracle = result.oracleManagerMock;

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

    fund = synthResult.fundToken;
    long = synthResult.longToken;
    short = synthResult.shortToken;
    marketIndex = synthResult.currentMarketIndex;
  });

  // also tests full exposure value change on price increase
  it("longshort: Initialize base case", async () => {
    await mintAndApprove(fund, defaultMintAmount, user1, longShort.address);
    await longShort.mintLong(marketIndex, new BN(defaultMintAmount), {
      from: user1,
    });

    await mintAndApprove(fund, defaultMintAmount, user2, longShort.address);
    await longShort.mintShort(marketIndex, new BN(defaultMintAmount), {
      from: user2,
    });

    // 100 fund tokens
    const longVal = await longShort.longValue.call(marketIndex); // $100
    const shortVal = await longShort.shortValue.call(marketIndex); // $100

    assert.equal(longVal.toString(), shortVal.toString(), "Price movement");

    const orcalePrice = await priceOracle.getMarketPriceByIndex.call("1");

    await priceOracle.increasePrice("1", tenPercentMovement);
    await longShort._updateSystemState(marketIndex);

    const newLongVal = await longShort.longValue.call(marketIndex); // $110
    const newShortVal = await longShort.shortValue.call(marketIndex); // $90

    // 110 fund tokens
    assert.equal(
      newLongVal.toString(),
      "110000000000000000000",
      "Longvalue change not correct"
    );

    // 90 fund tokens
    assert.equal(
      newShortVal.toString(),
      "90000000000000000000",
      "Short value change correct"
    );
  });

  it("longshort: Values change correctly on full exposure when price is adjusted downwards", async () => {
    // 100 fund tokens in each of long and short
    await mintLongShort2(
      marketIndex,
      user1,
      user2,
      defaultMintAmount,
      defaultMintAmount,
      true
    );

    await priceOracle.decreasePrice("1", tenPercentMovement);
    await longShort._updateSystemState(marketIndex);

    const newLongVal = await longShort.longValue.call(marketIndex);
    const newShortVal = await longShort.shortValue.call(marketIndex);

    // 90 fund tokens
    assert.equal(
      newLongVal.toString(),
      "90000000000000000000",
      "Longvalue change not correct"
    );

    // 110 fund tokens
    assert.equal(
      newShortVal.toString(),
      "110000000000000000000",
      "Short value change correct"
    );
  });

  it("longshort: Values change according to beta when price adjusted upwards", async () => {
    // 110 fund in short, 90 fund in long. mint short first to avoid fees / tipping
    await mintLongShort2(
      marketIndex,
      user1,
      user2,
      ninetyPercentDefaultMintAmount,
      hundredTenPercentDefaultMintAmount,
      false
    );

    await priceOracle.increasePrice("1", tenPercentMovement);
    await longShort._updateSystemState(marketIndex);

    const newLongVal = await longShort.longValue.call(marketIndex);
    const newShortVal = await longShort.shortValue.call(marketIndex);

    // 99 fund tokens
    assert.equal(
      newLongVal.toString(),
      "99000000000000000000",
      "Longvalue change not correct"
    );

    // 101 fund tokens
    assert.equal(
      newShortVal.toString(),
      "101000000000000000000",
      "Short value change correct"
    );
  });

  it("longshort: Values change according to beta when price adjusted downwards", async () => {
    // 110 fund in short, 90 fund in long. mint short first to avoid fees / tipping
    await mintLongShort2(
      marketIndex,
      user1,
      user2,
      ninetyPercentDefaultMintAmount,
      hundredTenPercentDefaultMintAmount,
      false
    );

    await priceOracle.decreasePrice("1", tenPercentMovement);
    await longShort._updateSystemState(marketIndex);

    const newLongVal = await longShort.longValue.call(marketIndex);
    const newShortVal = await longShort.shortValue.call(marketIndex);

    // 81 fund
    assert.equal(
      newLongVal.toString(),
      "81000000000000000000",
      "Longvalue change not correct"
    );

    // 119 fund
    assert.equal(
      newShortVal.toString(),
      "119000000000000000000",
      "Short value change correct"
    );
  });

  it("longshort: Price movements of 100% or greater upwards induce short liquidation", async () => {
    // 100 fund in short, 100 fund in long
    await mintLongShort2(
      marketIndex,
      user1,
      user2,
      defaultMintAmount,
      defaultMintAmount,
      false
    );

    await priceOracle.increasePrice("1", hundredPercentMovement);
    await longShort._updateSystemState(marketIndex);

    const newLongVal = await longShort.longValue.call(marketIndex);
    const newShortVal = await longShort.shortValue.call(marketIndex);

    // 200 fund
    assert.equal(
      newLongVal.toString(),
      "200000000000000000000",
      "Longvalue change not correct"
    );
    // 0 fund
    assert.equal(newShortVal.toString(), "0", "Short value change correct");

    await priceOracle.increasePrice("1", hundredPercentMovement);
    await longShort._updateSystemState(marketIndex);

    // 200 fund
    assert.equal(
      newLongVal.toString(),
      "200000000000000000000",
      "Longvalue change not correct"
    );
    // 0 fund
    assert.equal(newShortVal.toString(), "0", "Short value change correct");
  });

  it("longshort: Price movements of 100% downwards induce long liquidation", async () => {
    // 100 fund in short, 100 fund in long
    await mintLongShort2(
      marketIndex,
      user1,
      user2,
      defaultMintAmount,
      defaultMintAmount,
      false
    );

    await priceOracle.decreasePrice("1", hundredPercentMovement);
    await longShort._updateSystemState(marketIndex);

    const newLongVal = await longShort.longValue.call(marketIndex);
    const newShortVal = await longShort.shortValue.call(marketIndex);

    // 0 fund
    assert.equal(newLongVal.toString(), "0", "Longvalue change not correct");
    // 200 fund
    assert.equal(
      newShortVal.toString(),
      "200000000000000000000",
      "Short value change correct"
    );
  });

  it("longshort: Price changes induce no value change when only long has liquidity", async () => {
    // 100 fund to long
    await mintAndApprove(fund, defaultMintAmount, user1, longShort.address);
    await longShort.mintLong(marketIndex, new BN(defaultMintAmount), {
      from: user1,
    });

    await priceOracle.increasePrice("1", tenPercentMovement);
    await longShort._updateSystemState(marketIndex);

    const newLongVal = await longShort.longValue.call(marketIndex);
    const newShortVal = await longShort.shortValue.call(marketIndex);

    // 100 fund
    assert.equal(
      newLongVal.toString(),
      defaultMintAmount,
      "Longvalue change not correct"
    );

    // 0 fund
    assert.equal(newShortVal.toString(), "0", "Short value change correct");

    await priceOracle.decreasePrice("1", hundredPercentMovement);

    // 100 fund
    assert.equal(
      newLongVal.toString(),
      defaultMintAmount,
      "Longvalue change not correct"
    );

    // 0 fund
    assert.equal(newShortVal.toString(), "0", "Short value change correct");
  });

  it("longshort: Price changes induce no value change when only short has liquidity", async () => {
    // 100 fund to short
    await mintAndApprove(fund, defaultMintAmount, user1, longShort.address);
    await longShort.mintShort(marketIndex, new BN(defaultMintAmount), {
      from: user1,
    });

    await priceOracle.increasePrice("1", tenPercentMovement);
    await longShort._updateSystemState(marketIndex);

    const newLongVal = await longShort.longValue.call(marketIndex);
    const newShortVal = await longShort.shortValue.call(marketIndex);

    // 0 fund
    assert.equal(newLongVal.toString(), "0", "Longvalue change not correct");

    // 100 fund
    assert.equal(
      newShortVal.toString(),
      defaultMintAmount,
      "Short value change correct"
    );
    await priceOracle.decreasePrice("1", hundredPercentMovement);

    // 100 fund
    assert.equal(newLongVal.toString(), 0, "Longvalue change not correct");

    // 0 fund
    assert.equal(
      newShortVal.toString(),
      defaultMintAmount,
      "Short value change correct"
    );
  });

  const mintLongShort2 = async (
    marketIndex,
    longUser,
    shortUser,
    longAmount,
    shortAmount,
    longFirst
  ) => {
    if (longFirst) {
      // user 1
      await mintAndApprove(fund, longAmount, longUser, longShort.address);
      await longShort.mintLong(marketIndex, new BN(longAmount), {
        from: longUser,
      });
      // user 2
      await mintAndApprove(fund, shortAmount, shortUser, longShort.address);
      await longShort.mintShort(marketIndex, new BN(shortAmount), {
        from: shortUser,
      });
    } else {
      // user 2
      await mintAndApprove(fund, shortAmount, shortUser, longShort.address);
      await longShort.mintShort(marketIndex, new BN(shortAmount), {
        from: shortUser,
      });
      // user 1
      await mintAndApprove(fund, longAmount, longUser, longShort.address);
      await longShort.mintLong(marketIndex, new BN(longAmount), {
        from: longUser,
      });
    }
  };
});
