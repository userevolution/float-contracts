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
} = require("./helpers");

contract("LongShort", (accounts) => {
  let longShort;
  let long;
  let short;
  let dai;
  let priceOracle;
  let aaveLendingPool;

  // Default test values
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];

  const defaultMintAmount = "100000000000000000000"; // 100 dai etc.
  const oneUnitInWei = "1000000000000000000";

  beforeEach(async () => {
    const result = await initialize(admin);
    longShort = result.longShort;
    long = result.long;
    short = result.short;
    dai = result.dai;
    priceOracle = result.priceOracle;
    aaveLendingPool = result.aaveLendingPool;
  });

  it("longshort: Interest accrues correctly initially to short side if minted first.", async () => {
    await mintAndApprove(dai, defaultMintAmount, user1, longShort.address);

    // Create a short position
    await longShort.mintShort(new BN(defaultMintAmount), { from: user1 });

    // Now long position comes in.
    await mintAndApprove(dai, defaultMintAmount, user2, longShort.address);
    await longShort.mintLong(new BN(defaultMintAmount), { from: user2 });

    // The system should refresh and update after minting long tokens and reflect the interest earned by the short side
    const shortValueLocked = await longShort.shortValue.call();
    const shortValueExpected = simulateTotalValueWithInterest(
      defaultMintAmount,
      SIMULATED_INSTANT_APY
    );
    assert.equal(
      shortValueLocked.toString(),
      shortValueExpected.toString(),
      "Short value not correctly shown"
    );

    const shortTokenSupply = await short.totalSupply();
    // Check token prices are reflected correctly...
    const shortValueTokenPrice = await longShort.shortTokenPrice.call();
    const expectedShortValueTokenPrice = tokenPriceCalculator(
      shortValueExpected,
      shortTokenSupply
    );
    assert.equal(
      shortValueTokenPrice.toString(),
      expectedShortValueTokenPrice.toString(),
      "Token price not correct"
    );
    // right now a 1 short or long token costs 10*18
    // Think I might be getting it wrong and and 1 wei costs 10**18 ??

    const totalValueLocked = await longShort.totalValueLocked.call();
    const longValueExpected = simulateTotalValueWithInterest(
      defaultMintAmount,
      0
    );
    assert.equal(
      totalValueLocked.toString(),
      shortValueExpected.add(longValueExpected).toString(),
      "Total value not correctly shown"
    );
  });

  it("longshort: Interest accrues correctly initially to long side if minted first.", async () => {
    await mintAndApprove(dai, defaultMintAmount, user1, longShort.address);

    // Create a short position
    await longShort.mintLong(new BN(defaultMintAmount), { from: user1 });

    // Now long position comes in.
    await mintAndApprove(dai, defaultMintAmount, user2, longShort.address);
    await longShort.mintShort(new BN(defaultMintAmount), { from: user2 });

    // The system should refresh and update after minting long tokens and reflect the interest earned by the short side
    const longValueLocked = await longShort.longValue.call();
    const longValueExpected = simulateTotalValueWithInterest(
      defaultMintAmount,
      SIMULATED_INSTANT_APY
    );
    assert.equal(
      longValueLocked.toString(),
      longValueExpected.toString(),
      "Long value not correctly shown"
    );

    const longTokenSupply = await long.totalSupply();
    // Check token prices are reflected correctly...
    const longValueTokenPrice = await longShort.longTokenPrice.call();
    const expectedLongValueTokenPrice = tokenPriceCalculator(
      longValueExpected,
      longTokenSupply
    );
    assert.equal(
      longValueTokenPrice.toString(),
      expectedLongValueTokenPrice.toString(),
      "Token price not correct"
    );
    // right now a 1 short or long token costs 10*18
    // Think I might be getting it wrong and and 1 wei costs 10**18 ??

    const totalValueLocked = await longShort.totalValueLocked.call();
    const shortValueExpected = simulateTotalValueWithInterest(
      defaultMintAmount,
      0
    );
    assert.equal(
      totalValueLocked.toString(),
      shortValueExpected.add(longValueExpected).toString(),
      "Total value not correctly shown"
    );

    // Allocate interest earned and check reflected correctly...
    await longShort._updateSystemState();
    // the interest on the short side now should also be allocated
    const interestToBeSplit = simulateInterestEarned(
      defaultMintAmount,
      SIMULATED_INSTANT_APY
    );

    // 50/50 accural mechanism
    const longValueExpectedAfterInterest = longValueLocked.add(
      interestToBeSplit.div(new BN(2))
    );
    const longValueLockedActual = await longShort.longValue.call();
    assert.equal(
      longValueExpectedAfterInterest.toString(),
      longValueLockedActual.toString(),
      "Long value not correctly shown"
    );
    // Check token price also correct
    const longTokenSupply2 = await long.totalSupply();
    const longValueTokenPrice2 = await longShort.longTokenPrice.call();
    const expectedLongValueTokenPrice2 = tokenPriceCalculator(
      longValueExpectedAfterInterest,
      longTokenSupply2
    );
    assert.equal(
      longValueTokenPrice2.toString(),
      expectedLongValueTokenPrice2.toString(),
      "Token price not correct"
    );

    // Now lets check short side got the rest of the interest...
    // 50/50 accural mechanism
    const shortValueExpectedAfterInterest = shortValueExpected.add(
      interestToBeSplit.div(new BN(2))
    );
    const shortValueLockedActual = await longShort.shortValue.call();
    assert.equal(
      shortValueExpectedAfterInterest.toString(),
      shortValueLockedActual.toString(),
      "Long value not correctly shown"
    );
    // Check token price also correct
    const shortTokenSupply2 = await short.totalSupply();
    const shortValueTokenPrice2 = await longShort.shortTokenPrice.call();
    const expectedShortValueTokenPrice2 = tokenPriceCalculator(
      shortValueExpectedAfterInterest,
      shortTokenSupply2
    );
    assert.equal(
      shortValueTokenPrice2.toString(),
      expectedShortValueTokenPrice2.toString(),
      "Token price not correct"
    );
  });

  it("longshort: Further checking interest acrrues as expected.", async () => {
    await mintAndApprove(dai, defaultMintAmount, user1, longShort.address);

    // Create a short position
    await longShort.mintLong(new BN(defaultMintAmount), { from: user1 });

    // Now long position comes in.
    await mintAndApprove(dai, defaultMintAmount, user2, longShort.address);
    await longShort.mintShort(new BN(defaultMintAmount), { from: user2 });
    await longShort._updateSystemState();

    // All interest now currently allocated in system
    const longValueBefore = await longShort.longValue.call();
    const shortValueBefore = await longShort.shortValue.call();

    await aaveLendingPool.mockSendInterest(longShort.address, oneUnitInWei);
    await longShort._updateSystemState(); // allocates system + updates prices etc

    const longValueAfter = await longShort.longValue.call();
    const shortValueAfter = await longShort.shortValue.call();

    assert.equal(
      longValueBefore.add(new BN(oneUnitInWei).div(new BN(2))).toString(),
      longValueAfter.toString(),
      "Long value not correct"
    );

    assert.equal(
      shortValueBefore.add(new BN(oneUnitInWei).div(new BN(2))).toString(),
      shortValueAfter.toString(),
      "Short value not correct"
    );
  });
});
