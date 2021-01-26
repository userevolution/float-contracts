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
} = require("./helpers");

contract("LongShort", (accounts) => {
  let longShort;
  let long;
  let short;
  let dai;
  let priceOracle;
  let aaveLendingPool;
  let baseEntryFee;

  const defaultMintAmount = "100000000000000000000"; // 100 dai etc.
  const oneUnitInWei = "1000000000000000000";

  const ninetyPercentDefaultMintAmount = "90000000000000000000";
  const hundredTenPercentDefaultMintAmount = "110000000000000000000"

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
    long = result.long;
    short = result.short;
    dai = result.dai;
    priceOracle = result.priceOracle;
    aaveLendingPool = result.aaveLendingPool;
  });

  // also tests full exposure value change on price increase
  it("longshort: Initialize base case", async () => {
    // passing
    await aaveLendingPool.setSimulatedInstantAPY(0, { from: admin });

    await mintAndApprove(dai, defaultMintAmount, user1, longShort.address);
    await longShort.mintLong(new BN(defaultMintAmount), { from: user1 });

    await mintAndApprove(dai, defaultMintAmount, user2, longShort.address);
    await longShort.mintShort(new BN(defaultMintAmount), { from: user2 });

    // 100 dai
    const longVal = await longShort.longValue.call();
    const shortVal = await longShort.shortValue.call();

    assert.equal(longVal.toString(), shortVal.toString(), "Price movement");

    await priceOracle.increasePrice(tenPercentMovement);
    await longShort._updateSystemState();

    const newLongVal = await longShort.longValue.call();
    const newShortVal = await longShort.shortValue.call();

    // 110 dai
    assert.equal(
      newLongVal.toString(),
      "110000000000000000000",
      "Longvalue change not correct"
    );

    // 90 dai
    assert.equal(
      newShortVal.toString(),
      "90000000000000000000",
      "Short value change correct"
    );
  });

  it("longshort: Values change correctly on full exposure when price is adjusted downwards", async () => {
    await aaveLendingPool.setSimulatedInstantAPY(0, { from: admin });
    
    // 100 dai in each of long and short
    await mintLongShort2(user1, user2, 
      defaultMintAmount, defaultMintAmount, true);

    await priceOracle.decreasePrice(tenPercentMovement);
    await longShort._updateSystemState();

    const newLongVal = await longShort.longValue.call();
    const newShortVal = await longShort.shortValue.call();

    // 90 dai
    assert.equal(
      newLongVal.toString(),
      "90000000000000000000",
      "Longvalue change not correct"
    );

    // 110 dai
    assert.equal(
      newShortVal.toString(),
      "110000000000000000000",
      "Short value change correct"
    );

  });

  it("longshort: Values change according to beta when price adjusted upwards", async () => {
    await aaveLendingPool.setSimulatedInstantAPY(0, { from: admin });
    
    // 110 dai in short, 90 dai in long. mint short first to avoid fees / tipping
    await mintLongShort2(user1, user2, 
      ninetyPercentDefaultMintAmount, hundredTenPercentDefaultMintAmount, false);

    await priceOracle.increasePrice(tenPercentMovement);
    await longShort._updateSystemState();

    const newLongVal = await longShort.longValue.call();
    const newShortVal = await longShort.shortValue.call();

    // 99 dai
    assert.equal(
      newLongVal.toString(),
      "99000000000000000000",
      "Longvalue change not correct"
    );

    // 101 dai
    assert.equal(
      newShortVal.toString(),
      "101000000000000000000",
      "Short value change correct"
    );
  });

  it("longshort: Values change according to beta when price adjusted downwards", async () => {
    await aaveLendingPool.setSimulatedInstantAPY(0, { from: admin });
    
    // 110 dai in short, 90 dai in long. mint short first to avoid fees / tipping
    await mintLongShort2(user1, user2, 
      ninetyPercentDefaultMintAmount, hundredTenPercentDefaultMintAmount, false);

    await priceOracle.decreasePrice(tenPercentMovement);
    await longShort._updateSystemState();

    const newLongVal = await longShort.longValue.call();
    const newShortVal = await longShort.shortValue.call();

    // 81 dai
    assert.equal(
      newLongVal.toString(),
      "81000000000000000000",
      "Longvalue change not correct"
    );

    // 119 dai
    assert.equal(
      newShortVal.toString(),
      "119000000000000000000",
      "Short value change correct"
    );
  });

  it("longshort: Price movements of 100% or greater upwards induce short liquidation", async () => {
    await aaveLendingPool.setSimulatedInstantAPY(0, { from: admin });
    
    // 100 dai in short, 100 dai in long
    await mintLongShort2(user1, user2, 
      defaultMintAmount, defaultMintAmount, false);

    await priceOracle.increasePrice(hundredPercentMovement);
    await longShort._updateSystemState();


    const newLongVal = await longShort.longValue.call();
    const newShortVal = await longShort.shortValue.call();

    // 200 dai
    assert.equal(
      newLongVal.toString(),
      "200000000000000000000",
      "Longvalue change not correct"
    );
    // 0 dai
    assert.equal(
      newShortVal.toString(),
      "0",
      "Short value change correct"
    );

    await priceOracle.increasePrice(hundredPercentMovement);
    await longShort._updateSystemState();

    // 200 dai
    assert.equal(
      newLongVal.toString(),
      "200000000000000000000",
      "Longvalue change not correct"
    );
    // 0 dai
    assert.equal(
      newShortVal.toString(),
      "0",
      "Short value change correct"
    );
  });

  it("longshort: Price movements of 100% downwards induce long liquidation", async () => {
    await aaveLendingPool.setSimulatedInstantAPY(0, { from: admin });
    
    // 100 dai in short, 100 dai in long
    await mintLongShort2(user1, user2, 
      defaultMintAmount, defaultMintAmount, false);

    await priceOracle.decreasePrice(hundredPercentMovement);
    await longShort._updateSystemState();


    const newLongVal = await longShort.longValue.call();
    const newShortVal = await longShort.shortValue.call();

    // 0 dai
    assert.equal(
      newLongVal.toString(),
      "0",
      "Longvalue change not correct"
    );
    // 200 dai
    assert.equal(
      newShortVal.toString(),
      "200000000000000000000",
      "Short value change correct"
    );
  });

  it("longshort: Price changes induce no value change when only long has liquidity", async () => {
    await aaveLendingPool.setSimulatedInstantAPY(0, { from: admin });
    
    // 100 dai to long
    await mintAndApprove(dai, defaultMintAmount, user1, longShort.address);
    await longShort.mintLong(new BN(defaultMintAmount), { from: user1 });

    await priceOracle.increasePrice(tenPercentMovement);
    await longShort._updateSystemState();

    const newLongVal = await longShort.longValue.call();
    const newShortVal = await longShort.shortValue.call();

    // 100 dai
    assert.equal(
      newLongVal.toString(),
      defaultMintAmount,
      "Longvalue change not correct"
    );

    // 0 dai
    assert.equal(
      newShortVal.toString(),
      "0",
      "Short value change correct"
    );

    await priceOracle.decreasePrice(hundredPercentMovement);

    // 100 dai
    assert.equal(
      newLongVal.toString(),
      defaultMintAmount,
      "Longvalue change not correct"
    );

    // 0 dai
    assert.equal(
      newShortVal.toString(),
      "0",
      "Short value change correct"
    );
  });

  it("longshort: Price changes induce no value change when only short has liquidity", async () => {
    await aaveLendingPool.setSimulatedInstantAPY(0, { from: admin });
    
    // 100 dai to short
    await mintAndApprove(dai, defaultMintAmount, user1, longShort.address);
    await longShort.mintShort(new BN(defaultMintAmount), { from: user1 });

    await priceOracle.increasePrice(tenPercentMovement);
    await longShort._updateSystemState();

    const newLongVal = await longShort.longValue.call();
    const newShortVal = await longShort.shortValue.call();

    // 0 dai
    assert.equal(
      newLongVal.toString(),
      "0",
      "Longvalue change not correct"
    );

    // 100 dai
    assert.equal(
      newShortVal.toString(),
      defaultMintAmount,
      "Short value change correct"
    );
    await priceOracle.decreasePrice(hundredPercentMovement);

    // 100 dai
    assert.equal(
      newLongVal.toString(),
      0,
      "Longvalue change not correct"
    );

    // 0 dai
    assert.equal(
      newShortVal.toString(),
      defaultMintAmount,
      "Short value change correct"
    );
  });

  const mintLongShort2 = async (longUser, shortUser, longAmount, shortAmount, longFirst) => {
    if(longFirst){
        // user 1
        await mintAndApprove(dai, longAmount, longUser, longShort.address);
        await longShort.mintLong(new BN(longAmount), { from: longUser });
        // user 2
        await mintAndApprove(dai, shortAmount, shortUser, longShort.address);
        await longShort.mintShort(new BN(shortAmount), { from: shortUser });
    }else{
        // user 2
        await mintAndApprove(dai, shortAmount, shortUser, longShort.address);
        await longShort.mintShort(new BN(shortAmount), { from: shortUser });
        // user 1
        await mintAndApprove(dai, longAmount, longUser, longShort.address);
        await longShort.mintLong(new BN(longAmount), { from: longUser });
    }
  }


});
