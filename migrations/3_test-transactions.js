const SyntheticToken = artifacts.require("SyntheticToken");
const ShortCoins = artifacts.require("ShortCoins");
const LongShort = artifacts.require("LongShort");
const ADai = artifacts.require("ADai");
const Dai = artifacts.require("Dai");
const AaveLendingPool = artifacts.require("AaveLendingPool");
const LendingPoolAddressesProvider = artifacts.require(
  "LendingPoolAddressesProvider"
);
const PriceOracle = artifacts.require("PriceOracle");

const {
  BN,
  expectRevert,
  ether,
  expectEvent,
  balance,
  time,
} = require("@openzeppelin/test-helpers");

const { mintAndApprove } = require("../test/helpers");

module.exports = async function(deployer, network, accounts) {
  console.log(99);

  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  const user3 = accounts[3];

  const currentMarketIndex = 1;
  const oneHundredMintAmount = "100000000000000000000";

  console.log(0);

  const priceOracle = await PriceOracle.deployed();

  const longShort = await LongShort.deployed();

  const daiAddress = await longShort.daiContract.call();
  let dai = await SyntheticToken.at(daiAddress);

  const longAddress = await longShort.longTokens.call(currentMarketIndex);
  const shortAddress = await longShort.shortTokens.call(currentMarketIndex);

  let long = await SyntheticToken.at(longAddress);
  let short = await SyntheticToken.at(shortAddress);

  await mintAndApprove(dai, oneHundredMintAmount, user1, longShort.address);
  await longShort.mintLong(currentMarketIndex, new BN(oneHundredMintAmount), {
    from: user1,
  });

  await mintAndApprove(dai, oneHundredMintAmount, user2, longShort.address);
  await longShort.mintShort(currentMarketIndex, new BN(oneHundredMintAmount), {
    from: user2,
  });

  console.log(100);

  // Making even more short tokens
  await mintAndApprove(dai, oneHundredMintAmount, user3, longShort.address);
  await longShort.mintShort(currentMarketIndex, new BN(oneHundredMintAmount), {
    from: user3,
  });

  console.log(1);

  // increase oracle price
  const tenPercentMovement = "100000000000000000";
  await priceOracle.increasePrice(tenPercentMovement);

  console.log(2);

  await longShort._updateSystemState(currentMarketIndex);

  console.log(3);

  // Simulate user 2 redeeming all his tokens.
  await short.increaseAllowance(longShort.address, oneHundredMintAmount, {
    from: user2,
  });
  console.log(4);

  await longShort.redeemShort(
    currentMarketIndex,
    new BN(oneHundredMintAmount),
    {
      from: user2,
    }
  );

  console.log(5);
};
