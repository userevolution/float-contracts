const {
  BN,
  expectRevert,
  ether,
  expectEvent,
  balance,
  time,
} = require("@openzeppelin/test-helpers");

const { initialize, mintAndApprove, createSynthetic } = require("./helpers");

contract("LongShort (initialisation)", (accounts) => {
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
  const _badLiquidityEntryFee = 50;
  const _baseExitFee = 50;
  const _badLiquidityExitFee = 50;

  // Default test values
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];

  const defaultMintAmount = "100000000000000000000"; // 100 dai etc.
  const oneUnitInWei = "1000000000000000000";

  beforeEach(async () => {
    const result = await initialize(admin);
    longShort = result.longShort;

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
    priceOracle = synthResult.oracle;
    marketIndex = synthResult.currentMarketIndex;
  });

  it("successfully initialises, long position can be made", async () => {
    await mintAndApprove(fund, defaultMintAmount, user1, longShort.address);

    // Create a long position
    await longShort.mintLong(marketIndex, new BN(defaultMintAmount), {
      from: user1,
    });

    const user1LongTokens = await long.balanceOf(user1);
    const user1FundTokens = await fund.balanceOf(user1);

    assert.equal(
      user1LongTokens,
      defaultMintAmount,
      "Correct tokens not minted on initialization"
    );
    assert.equal(user1FundTokens, 0, "Tokens not taken when minting position");
  });

  it("successfully initialises, short position can be created.", async () => {
    await mintAndApprove(fund, defaultMintAmount, user1, longShort.address);

    // Create a short position
    await longShort.mintShort(marketIndex, new BN(defaultMintAmount), {
      from: user1,
    });

    const user1ShortTokens = await short.balanceOf(user1);
    const user1FundTokens = await fund.balanceOf(user1);

    assert.equal(
      user1ShortTokens,
      defaultMintAmount,
      "Correct tokens not minted on initialization"
    );
    assert.equal(user1FundTokens, 0, "Tokens not taken when minting position");
  });

  it("succesfully initialises, long/short sides created with correct price/value", async () => {
    await mintAndApprove(fund, defaultMintAmount, user1, longShort.address);

    // Create a short position
    await longShort.mintShort(marketIndex, new BN(defaultMintAmount), {
      from: user1,
    });

    const user1ShortTokens = await short.balanceOf(user1);
    assert.equal(
      user1ShortTokens,
      defaultMintAmount,
      "Correct tokens not minted on initialization"
    );
    // Check the other values are set correctly
    const totalValueLocked = await longShort.totalValueLockedInMarket.call(
      marketIndex
    );
    assert.equal(
      totalValueLocked.toString(),
      defaultMintAmount,
      "Total value not correctly shown"
    );

    const shortValueLocked = await longShort.shortValue.call(marketIndex);
    assert.equal(
      shortValueLocked.toString(),
      defaultMintAmount,
      "Short value not correctly shown"
    );

    // Check token prices are reflected correctly...
    const shortValueTokenPrice = await longShort.shortTokenPrice.call(
      marketIndex
    );
    assert.equal(
      shortValueTokenPrice.toString(),
      oneUnitInWei,
      "Token price not correct"
    );

    // Now long position comes in.
    await mintAndApprove(fund, defaultMintAmount, user2, longShort.address);
    // Create a long position
    // Price always starts at $1 per side.
    await longShort.mintLong(marketIndex, new BN(defaultMintAmount), {
      from: user2,
    });
    const user2LongTokens = await long.balanceOf(user2);
    assert.equal(
      user2LongTokens,
      defaultMintAmount,
      "Correct tokens not minted on initialization"
    );

    // Check token prices are reflected correctly...
    const longValueTokenPrice = await longShort.longTokenPrice.call(
      marketIndex
    );
    assert.equal(
      longValueTokenPrice.toString(),
      oneUnitInWei,
      "Token price not correct"
    );
  });
});
