const SyntheticToken = artifacts.require("SyntheticToken");

const PriceOracle = artifacts.require("PriceOracle");
const LongShort = artifacts.require("LongShort");

const { BN } = require("@openzeppelin/test-helpers");

const { mintAndApprove } = require("../test/helpers");

const deployTestMarket = async (
  syntheticSymbol,
  syntheticName,
  longShortInstance,
  deployer
) => {
  // Deploy a synthetic market:
  // Use these as defaults
  const _baseEntryFee = 0;
  const _badLiquidityEntryFee = 50;
  const _baseExitFee = 30;
  const _badLiquidityExitFee = 50;

  const priceOracle = await deployer.deploy(PriceOracle, "1000000000000000000");

  await longShortInstance.newSyntheticMarket(
    syntheticName,
    syntheticSymbol,
    priceOracle.address,
    _baseEntryFee,
    _badLiquidityEntryFee,
    _baseExitFee,
    _badLiquidityExitFee
  );
};
module.exports = async function(deployer, network, accounts) {
  console.log(99);

  const user1 = accounts[1];
  const user2 = accounts[2];
  const user3 = accounts[3];

  const oneHundredMintAmount = "100000000000000000000";

  const longShort = await LongShort.deployed();
  // await deployTestMarket("FTSE100", "FTSE", longShort, deployer);
  // await deployTestMarket("GOLD", "GOLD", longShort, deployer);
  // await deployTestMarket("SP", "S&P500", longShort, deployer);
  const currentMarketIndex = (await longShort.latestMarket()).toNumber();

  const daiAddress = await longShort.daiContract.call();
  let dai = await SyntheticToken.at(daiAddress);

  // console.log("accounts", accounts);
  for (let marketIndex = 2; marketIndex <= currentMarketIndex; ++marketIndex) {
    const longAddress = await longShort.longTokens.call(marketIndex);
    const shortAddress = await longShort.shortTokens.call(marketIndex);
    const priceOracleAddress = await longShort.priceFeed.call(marketIndex);
    const priceOracle = await PriceOracle.at(priceOracleAddress);

    let long = await SyntheticToken.at(longAddress);
    let short = await SyntheticToken.at(shortAddress);

    await mintAndApprove(dai, oneHundredMintAmount, user1, longShort.address);
    await longShort.mintLong(marketIndex, new BN(oneHundredMintAmount), {
      from: user1,
    });

    await mintAndApprove(dai, oneHundredMintAmount, user2, longShort.address);
    await longShort.mintShort(marketIndex, new BN(oneHundredMintAmount), {
      from: user2,
    });

    // Making even more short tokens
    await mintAndApprove(dai, oneHundredMintAmount, user3, longShort.address);
    await longShort.mintShort(marketIndex, new BN(oneHundredMintAmount), {
      from: user3,
    });

    console.log(1);

    // increase oracle price
    const tenPercentMovement = "100000000000000000";
    await priceOracle.increasePrice(tenPercentMovement);

    console.log(2);

    await longShort._updateSystemState(marketIndex);

    console.log(3);

    // Simulate user 2 redeeming half his tokens.
    const halfTokensMinted = new BN(oneHundredMintAmount).div(new BN(2));
    await short.increaseAllowance(longShort.address, halfTokensMinted, {
      from: user2,
    });
    console.log(4);

    await longShort.redeemShort(marketIndex, halfTokensMinted, {
      from: user2,
    });
    // Simulate user 1 redeeming a third of his tokens.
    const thirdTokensMinted = new BN(oneHundredMintAmount).div(new BN(3));
    await long.increaseAllowance(longShort.address, thirdTokensMinted, {
      from: user1,
    });
    console.log(4);

    await longShort.redeemLong(marketIndex, thirdTokensMinted, {
      from: user1,
    });

    console.log(5);
  }
};
