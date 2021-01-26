const LongCoins = artifacts.require("LongCoins");
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

const {
  initialize,
  mintAndApprove,
  SIMULATED_INSTANT_APY,
  simulateInterestEarned,
  tokenPriceCalculator,
  simulateTotalValueWithInterest,
  feeCalculation,
} = require("../test/helpers");

module.exports = async function(deployer, network, accounts) {
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  const user3 = accounts[3];

  const oneHundredMintAmount = "100000000000000000000";

  let long = await LongCoins.deployed();
  let short = await ShortCoins.deployed();

  let dai = await Dai.deployed();

  let aDai = await ADai.deployed();

  const aaveLendingPool = await AaveLendingPool.deployed();

  const priceOracle = await PriceOracle.deployed();

  const longShort = await LongShort.deployed();

  await mintAndApprove(dai, oneHundredMintAmount, user1, longShort.address);
  await longShort.mintLong(new BN(oneHundredMintAmount), { from: user1 });

  await mintAndApprove(dai, oneHundredMintAmount, user2, longShort.address);
  await longShort.mintShort(new BN(oneHundredMintAmount), { from: user2 });

  // Making even more short tokens
  await mintAndApprove(dai, oneHundredMintAmount, user3, longShort.address);
  await longShort.mintShort(new BN(oneHundredMintAmount), { from: user3 });

  console.log(1);

  // increase oracle price
  const tenPercentMovement = "100000000000000000";
  await priceOracle.increasePrice(tenPercentMovement);

  console.log(2);

  await longShort._updateSystemState();

  console.log(3);

  // Simulate user 2 redeeming all his tokens.
  await short.increaseAllowance(longShort.address, oneHundredMintAmount, {
    from: user2,
  });
  console.log(4);

  await longShort.redeemShort(new BN(oneHundredMintAmount), {
    from: user2,
  });

  console.log(5);
};
