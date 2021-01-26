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
  const oneUnitInWei = "1000000000000000000"; // 10**18

  const tenPercentMovement = "100000000000000000";

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

  it("longshort: Initialize base case", async () => {
    // passing
    await aaveLendingPool.setSimulatedInstantAPY(0, { from: admin });

    await mintAndApprove(dai, defaultMintAmount, user1, longShort.address);
    await longShort.mintLong(new BN(defaultMintAmount), { from: user1 });

    await mintAndApprove(dai, defaultMintAmount, user2, longShort.address);
    await longShort.mintShort(new BN(defaultMintAmount), { from: user2 });

    // 100 dai
    const longVal = await longShort.longValue.call(); // $100
    const shortVal = await longShort.shortValue.call(); // $100

    assert.equal(longVal.toString(), shortVal.toString(), "Price movement");

    await priceOracle.increasePrice(tenPercentMovement);
    await longShort._updateSystemState();

    const newLongVal = await longShort.longValue.call(); // $110
    const newShortVal = await longShort.shortValue.call(); // $90

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

  // Case check: Test if there is a 150% price movement
  // Check if price decreases it works.]
});
