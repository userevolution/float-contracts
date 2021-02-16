const Dai = artifacts.require("Dai");
const SyntheticToken = artifacts.require("SyntheticToken");

const oracleAggregator = artifacts.require("OracleManagerMock");
const LongShort = artifacts.require("LongShort");

const { BN } = require("@openzeppelin/test-helpers");

const mintAndApprove = async (token, amount, user, approvedAddress) => {
  let bnAmount = new BN(amount);
  await token.mint(user, bnAmount);
  await token.approve(approvedAddress, bnAmount, {
    from: user,
  });
};

const deployTestMarket = async (
  syntheticSymbol,
  syntheticName,
  longShortInstance,
  fundTokenInstance,
  oracleAddress
) => {
  // Deploy a synthetic market:
  // Use these as defaults
  const _baseEntryFee = 0;
  const _badLiquidityEntryFee = 50;
  const _baseExitFee = 30;
  const _badLiquidityExitFee = 50;

  await longShortInstance.newSyntheticMarket(
    syntheticName,
    syntheticSymbol,
    fundTokenInstance.address,
    oracleAddress,
    _baseEntryFee,
    _badLiquidityEntryFee,
    _baseExitFee,
    _badLiquidityExitFee
  );
};

module.exports = async function(deployer, network, accounts) {
  const user1 = accounts[1];
  const user2 = accounts[2];
  const user3 = accounts[3];

  const dummyOracleAddress1 = "0x1230000000000000000000000000000000000001";
  const dummyOracleAddress2 = "0x1230000000000000000000000000000000000002";
  const dummyOracleAddress3 = "0x1230000000000000000000000000000000000003";

  const oneHundredMintAmount = "100000000000000000000";

  const dai = await Dai.deployed();

  const oracleAgregator = await oracleAggregator.deployed();

  const longShort = await LongShort.deployed();
  await deployTestMarket(
    "FTSE100",
    "FTSE",
    longShort,
    dai,
    dummyOracleAddress1
  );
  await deployTestMarket("GOLD", "GOLD", longShort, dai, dummyOracleAddress2);
  await deployTestMarket("SP", "S&P500", longShort, dai, dummyOracleAddress3);
  const currentMarketIndex = (await longShort.latestMarket()).toNumber();

  for (let marketIndex = 1; marketIndex <= currentMarketIndex; ++marketIndex) {
    const longAddress = await longShort.longTokens.call(marketIndex);
    const shortAddress = await longShort.shortTokens.call(marketIndex);

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

    // increase oracle price
    const tenPercentMovement = "100000000000000000";
    await oracleAgregator.increasePrice("1", tenPercentMovement);

    await longShort._updateSystemState(marketIndex);

    // Simulate user 2 redeeming half his tokens.
    const halfTokensMinted = new BN(oneHundredMintAmount).div(new BN(2));
    await short.increaseAllowance(longShort.address, halfTokensMinted, {
      from: user2,
    });

    await longShort.redeemShort(marketIndex, halfTokensMinted, {
      from: user2,
    });

    // Simulate user 1 redeeming a third of his tokens.
    const thirdTokensMinted = new BN(oneHundredMintAmount).div(new BN(3));
    await long.increaseAllowance(longShort.address, thirdTokensMinted, {
      from: user1,
    });

    await longShort.redeemLong(marketIndex, thirdTokensMinted, {
      from: user1,
    });
  }
};
