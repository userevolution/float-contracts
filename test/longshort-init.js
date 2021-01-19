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
} = require("./helpers");

contract("LongShort", (accounts) => {
  let longShort;
  let long;
  let short;
  let dai;
  let priceOracle;

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
  });

  it("longshort: contract initialises, Long position can be made", async () => {
    await mintAndApprove(dai, defaultMintAmount, user1, longShort.address);

    // Create a long position
    await longShort.mintLong(new BN(defaultMintAmount), { from: user1 });

    const user1LongTokens = await long.balanceOf(user1);
    const user1DaiTokens = await dai.balanceOf(user1);

    assert.equal(
      user1LongTokens,
      defaultMintAmount,
      "Correct tokens not minted on initialization"
    );
    assert.equal(user1DaiTokens, 0, "Tokens not taken when minting position");
  });

  it("longshort: contract initialises, short position can be created.", async () => {
    await mintAndApprove(dai, defaultMintAmount, user1, longShort.address);

    // Create a short position
    await longShort.mintShort(new BN(defaultMintAmount), { from: user1 });

    const user1ShortTokens = await short.balanceOf(user1);
    const user1DaiTokens = await dai.balanceOf(user1);

    assert.equal(
      user1ShortTokens,
      defaultMintAmount,
      "Correct tokens not minted on initialization"
    );
    assert.equal(user1DaiTokens, 0, "Tokens not taken when minting position");
  });

  it("longshort: contract initialises,long short sides both created. Token price and value correct.", async () => {
    await mintAndApprove(dai, defaultMintAmount, user1, longShort.address);

    // Create a short position
    await longShort.mintShort(new BN(defaultMintAmount), { from: user1 });

    const user1ShortTokens = await short.balanceOf(user1);
    assert.equal(
      user1ShortTokens,
      defaultMintAmount,
      "Correct tokens not minted on initialization"
    );
    // Check the other values are set correctly
    const totalValueLocked = await longShort.totalValueLocked.call();
    assert.equal(
      totalValueLocked.toString(),
      defaultMintAmount,
      "Total value not correctly shown"
    );

    const shortValueLocked = await longShort.shortValue.call();
    assert.equal(
      shortValueLocked.toString(),
      defaultMintAmount,
      "Short value not correctly shown"
    );

    // Check token prices are reflected correctly...
    const shortValueTokenPrice = await longShort.shortTokenPrice.call();
    assert.equal(
      shortValueTokenPrice.toString(),
      oneUnitInWei,
      "Token price not correct"
    );

    // Now long position comes in.
    await mintAndApprove(dai, defaultMintAmount, user2, longShort.address);
    // Create a long position
    // Price always starts at $1 per side.
    await longShort.mintLong(new BN(defaultMintAmount), { from: user2 });
    const user2LongTokens = await long.balanceOf(user2);
    assert.equal(
      user2LongTokens,
      defaultMintAmount,
      "Correct tokens not minted on initialization"
    );

    // Check token prices are reflected correctly...
    const longValueTokenPrice = await longShort.longTokenPrice.call();
    assert.equal(
      longValueTokenPrice.toString(),
      oneUnitInWei,
      "Token price not correct"
    );
  });
});
