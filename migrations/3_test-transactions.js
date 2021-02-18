const Dai = artifacts.require("Dai");
const SyntheticToken = artifacts.require("SyntheticToken");
const YieldManagerMock = artifacts.require("YieldManagerMock");
const YieldManagerVenus = artifacts.require("YieldManagerVenus");

const OracleAggregator = artifacts.require("OracleManagerMock");
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
  oracleAddress,
  admin
) => {
  // Deploy a synthetic market:
  // Use these as defaults
  const _baseEntryFee = 0;
  const _badLiquidityEntryFee = 50;
  const _baseExitFee = 30;
  const _badLiquidityExitFee = 50;

  let yieldManager = await YieldManagerMock.new();

  await yieldManager.setup(
    admin,
    longShortInstance.address,
    fundTokenInstance.address
  );

  // Mock yield manager needs to be able to mint tokens to simulate yield.
  // NOTE: remove this when we go full venus.
  var mintRole = await fundTokenInstance.MINTER_ROLE.call();
  await fundTokenInstance.grantRole(mintRole, yieldManager.address);

  await longShortInstance.newSyntheticMarket(
    syntheticName,
    syntheticSymbol,
    fundTokenInstance.address,
    oracleAddress,
    yieldManager.address,
    _baseEntryFee,
    _badLiquidityEntryFee,
    _baseExitFee,
    _badLiquidityExitFee
  );
};

const zeroPointTwoEth = new BN("200000000000000000");
const zeroPointFiveEth = new BN("500000000000000000");
const topupBalanceIfLow = async (from, to) => {
  const senderBalance = new BN(await web3.eth.getBalance(from));
  if (zeroPointFiveEth.gt(senderBalance)) {
    throw "The admin account doesn't have enough ETH - need at least 0.5 ETH! (top up to over 1 ETH to be safe)";
  }
  const recieverBalance = new BN(await web3.eth.getBalance(to));
  if (zeroPointTwoEth.gt(recieverBalance)) {
    await web3.eth.sendTransaction({
      from,
      to,
      value: zeroPointTwoEth,
    });
  }
};

module.exports = async function (deployer, network, accounts) {
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  const user3 = accounts[3];

  await topupBalanceIfLow(admin, user1);
  await topupBalanceIfLow(admin, user2);
  await topupBalanceIfLow(admin, user3);

  const dummyOracleAddress1 = "0x1230000000000000000000000000000000000001";
  const dummyOracleAddress2 = "0x1230000000000000000000000000000000000002";
  const dummyOracleAddress3 = "0x1230000000000000000000000000000000000003";

  const oneHundredMintAmount = "100000000000000000000";

  const dai = await Dai.deployed();

  const oracleAggregator = await OracleAggregator.deployed();

  const longShort = await LongShort.deployed();
  await deployTestMarket(
    "FTSE100",
    "FTSE",
    longShort,
    dai,
    dummyOracleAddress1,
    admin
  );
  await deployTestMarket(
    "GOLD",
    "GOLD",
    longShort,
    dai,
    dummyOracleAddress2,
    admin
  );
  await deployTestMarket(
    "SP",
    "S&P500",
    longShort,
    dai,
    dummyOracleAddress3,
    admin
  );

  const currentMarketIndex = (await longShort.latestMarket()).toNumber();

  console.log("The latest market index is", currentMarketIndex);

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
    await oracleAggregator.increasePrice("1", tenPercentMovement);

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
