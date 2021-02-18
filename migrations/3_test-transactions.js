const { BN } = require("@openzeppelin/test-helpers");

const Dai = artifacts.require("Dai");
const LongShort = artifacts.require("LongShort");
const SyntheticToken = artifacts.require("SyntheticToken");
const YieldManagerMock = artifacts.require("YieldManagerMock");
const OracleAggregator = artifacts.require("OracleManagerMock");
const YieldManagerVenus = artifacts.require("YieldManagerVenus");

// BSC testnet BUSD and vBUSD token addresses (for venus).
const bscBUSDAddress = "0x8301F2213c0eeD49a7E28Ae4c3e91722919B8B47";
const bscVBUSDAddress = "0x08e0A5575De71037aE36AbfAfb516595fE68e5e4";

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
  admin,
  networkName
) => {
  // Default mint/redeem fees.
  const _baseEntryFee = 0;
  const _badLiquidityEntryFee = 50;
  const _baseExitFee = 30;
  const _badLiquidityExitFee = 50;

  // We mock out the yield manager unless we're on BSC testnet.
  let yieldManager;
  let fundTokenAddress;
  if (networkName == "binanceTest") {
    yieldManager = await YieldManagerVenus.new();
    fundTokenAddress = bscBUSDAddress;

    await yieldManager.setup(
      admin,
      longShortInstance.address,
      bscBUSDAddress,
      bscVBUSDAddress
    );
  } else {
    yieldManager = await YieldManagerMock.new();
    fundTokenAddress = fundTokenInstance.address;

    await yieldManager.setup(
      admin,
      longShortInstance.address,
      fundTokenInstance.address
    );

    var mintRole = await fundTokenInstance.MINTER_ROLE.call();
    await fundTokenInstance.grantRole(mintRole, yieldManager.address);
  }

  await longShortInstance.newSyntheticMarket(
    syntheticName,
    syntheticSymbol,
    fundTokenAddress,
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

module.exports = async function(deployer, network, accounts) {
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

  // We use fake DAI if we're not on BSC testnet.
  let token;
  if (network != "binanceTest") {
    token = await Dai.deployed();
  }

  const oracleAggregator = await OracleAggregator.deployed();

  const longShort = await LongShort.deployed();
  await deployTestMarket(
    "FTSE100",
    "FTSE",
    longShort,
    token,
    dummyOracleAddress1,
    admin,
    network
  );
  await deployTestMarket(
    "GOLD",
    "GOLD",
    longShort,
    token,
    dummyOracleAddress2,
    admin,
    network
  );
  await deployTestMarket(
    "SP",
    "S&P500",
    longShort,
    token,
    dummyOracleAddress3,
    admin,
    network
  );

  // Don't try to mint tokens and fake transactions on BSC testnet.
  if (network == "binanceTest") {
    return;
  }

  const currentMarketIndex = (await longShort.latestMarket()).toNumber();
  for (let marketIndex = 1; marketIndex <= currentMarketIndex; ++marketIndex) {
    console.log(`Simulating transactions for marketIndex: ${marketIndex}`);
    const longAddress = await longShort.longTokens.call(marketIndex);
    const shortAddress = await longShort.shortTokens.call(marketIndex);

    let long = await SyntheticToken.at(longAddress);
    let short = await SyntheticToken.at(shortAddress);

    await mintAndApprove(token, oneHundredMintAmount, user1, longShort.address);
    await longShort.mintLong(marketIndex, new BN(oneHundredMintAmount), {
      from: user1,
    });

    await mintAndApprove(token, oneHundredMintAmount, user2, longShort.address);
    await longShort.mintShort(marketIndex, new BN(oneHundredMintAmount), {
      from: user2,
    });

    await mintAndApprove(token, oneHundredMintAmount, user3, longShort.address);
    await longShort.mintShort(marketIndex, new BN(oneHundredMintAmount), {
      from: user3,
    });

    // Increase oracle price.
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

    await mintAndApprove(dai, oneHundredMintAmount, user3, longShort.address);
    await longShort.mintLongAndStake(
      marketIndex,
      new BN(oneHundredMintAmount),
      {
        from: user3,
      }
    );

    await mintAndApprove(dai, oneHundredMintAmount, user3, longShort.address);
    await longShort.mintShortAndStake(
      marketIndex,
      new BN(oneHundredMintAmount),
      {
        from: user3,
      }
    );
  }
};
