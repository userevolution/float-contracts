const { BN } = require("@openzeppelin/test-helpers");
const { web3 } = require("@nomiclabs/hardhat-web3");

const LONGSHORT_CONTRACT_NAME = "LongShort";
const YIELD_MANAGER = "YieldManagerMock";
const ORACLE_AGREGATOR = "OracleManagerMock";
const SYNTHETIC_TOKEN = "SyntheticToken";
const TOKEN_FACTORY = "TokenFactory";
const STAKER = "Staker";
const FLOAT_TOKEN = "FloatToken";

const SIMULATED_INSTANT_APY = 10;
const TEN_TO_THE_18 = "1000000000000000000";

const erc20 = artifacts.require(SYNTHETIC_TOKEN);
const LongShort = artifacts.require(LONGSHORT_CONTRACT_NAME);
const OracleManagerMock = artifacts.require(ORACLE_AGREGATOR);
const YieldManager = artifacts.require(YIELD_MANAGER);
const TokenFactory = artifacts.require(TOKEN_FACTORY);
const Staker = artifacts.require(STAKER);
const FloatToken = artifacts.require(FLOAT_TOKEN);

const initialize = async (admin) => {
  const tokenFactory = await TokenFactory.new({
    from: admin,
  });

  const floatToken = await FloatToken.new({
    from: admin,
  });

  const staker = await Staker.new({
    from: admin,
  });

  const longShort = await LongShort.new({
    from: admin,
  });
  const oracleManagerMock = await OracleManagerMock.new({
    from: admin,
  });
  const yieldManager = await YieldManager.new({
    from: admin,
  });

  await floatToken.setup("Float token", "FLOAT TOKEN", staker.address, {
    from: admin,
  });

  await tokenFactory.setup(admin, longShort.address, {
    from: admin,
  });

  await oracleManagerMock.setup(admin, longShort.address, {
    from: admin,
  });

  await yieldManager.setup(admin, longShort.address, {
    from: admin,
  });

  await longShort.setup(
    admin,
    tokenFactory.address,
    staker.address,
    oracleManagerMock.address,
    yieldManager.address,
    {
      from: admin,
    }
  );

  await staker.initialize(admin, longShort.address, floatToken.address, {
    from: admin,
  });

  return {
    longShort,
    tokenFactory,
    oracleManagerMock,
    yieldManager,
  };
};

const createSynthetic = async (
  admin,
  longShort,
  syntheticName,
  syntheticSymbol,
  _baseEntryFee,
  _badLiquidityEntryFee,
  _baseExitFee,
  _badLiquidityExitFee
) => {
  const fundToken = await erc20.new({
    from: admin,
  });

  // For testing, we will use the fundToken's address as the oracle address. This is likely to chance in the future
  const priceOracleAddress = fundToken.address;

  await fundToken.initialize("fund token", "FND", {
    from: admin,
  });

  await longShort.newSyntheticMarket(
    syntheticName,
    syntheticSymbol,
    fundToken.address,
    priceOracleAddress,
    _baseEntryFee,
    _badLiquidityEntryFee,
    _baseExitFee,
    _badLiquidityExitFee,
    { from: admin }
  );

  const currentMarketIndex = await longShort.latestMarket.call();
  const longAddress = await longShort.longTokens.call(currentMarketIndex);
  const shortAddress = await longShort.shortTokens.call(currentMarketIndex);

  let longToken = await erc20.at(longAddress);
  let shortToken = await erc20.at(shortAddress);

  return {
    currentMarketIndex,
    longToken,
    shortToken,
    fundToken,
  };
};

const mintAndApprove = async (token, amount, user, approvedAddress) => {
  let bnAmount = new BN(amount);
  await token.mint(user, bnAmount);
  await token.approve(approvedAddress, bnAmount, {
    from: user,
  });
};

const simulateTotalValueWithInterest = (amount, apy) => {
  let bnAmount = new BN(amount);
  return bnAmount.add(bnAmount.mul(new BN(apy)).div(new BN(100)));
};

const simulateInterestEarned = (amount, apy) => {
  let bnAmount = new BN(amount);
  return bnAmount.mul(new BN(apy)).div(new BN(100));
};

const tokenPriceCalculator = (value, supply) => {
  return new BN(value).mul(new BN("1000000000000000000")).div(new BN(supply));
};

const feeCalculation = (
  _amount,
  _longValue,
  _shortValue,
  _baseEntryFee,
  _entryFeeMultiplier,
  _minThreshold,
  _feeUnitsOfPrecision,
  isLongDeposit,
  thinBeta
) => {
  // check if imbalance or not
  amount = new BN(_amount);
  longValue = new BN(_longValue);
  shortValue = new BN(_shortValue);
  baseEntryFee = new BN(_baseEntryFee);
  entryFeeMultiplier = new BN(_entryFeeMultiplier);
  minThreshold = new BN(_minThreshold);
  feeUnitsOfPrecision = new BN(_feeUnitsOfPrecision);

  let fees;
  //console.log("am i going off");
  // simple 0.5% fee
  if (isLongDeposit) {
    // Adding to heavy side
    if (longValue.gt(shortValue)) {
      fees = baseEntryFee.mul(amount).div(feeUnitsOfPrecision);
      // Adding to thin side & tipping
    } else if (longValue.add(amount).gt(shortValue)) {
      let amountLiableForFee = amount.sub(shortValue.sub(longValue));
      fees = baseEntryFee.mul(amountLiableForFee).div(feeUnitsOfPrecision);
      // Adding to thin side
    } else {
      fees = new BN(0);
    }
  } else {
    // Adding to heavy side
    if (shortValue.gt(longValue)) {
      fees = baseEntryFee.mul(amount).div(feeUnitsOfPrecision);
      // Adding to thin side & tipping
    } else if (shortValue.add(amount).gt(longValue)) {
      let amountLiableForFee = amount.sub(longValue.sub(shortValue));
      fees = baseEntryFee.mul(amountLiableForFee).div(feeUnitsOfPrecision);
      // Adding to thin side
    } else {
      fees = new BN(0);
    }
  }
  // If greater than minFeeThreshold
  if (
    amount
      .add(longValue)
      .add(shortValue)
      .gte(minThreshold)
  ) {
    const TEN_TO_THE_18 = "1" + "000000000000000000";
    let betaDiff = new BN(TEN_TO_THE_18).sub(thinBeta); // TODO: when previous beta != 1

    let residualAmount = new BN(amount);
    let totalValueLocked = longValue.add(shortValue).add(amount);
    let amountIsPassingScalingFees = totalValueLocked
      .sub(amount)
      .lt(minThreshold);
    if (amountIsPassingScalingFees) {
      residualAmount = totalValueLocked.sub(minThreshold);
    }

    let additionalFees = new BN(residualAmount)
      .mul(new BN(betaDiff))
      .mul(new BN(10))
      .mul(new BN(100))
      .div(new BN(feeUnitsOfPrecision))
      .div(new BN(TEN_TO_THE_18));

    fees = fees.add(additionalFees);
  }
  return fees;
};

const logGasPrices = async (
  functionName,
  receipt,
  ethPriceUsd,
  bnbPriceUsd,
  ethGasPriceGwei,
  bnbGasPriceGwei
) => {
  const ONE_GWEI = new BN("1000000000");
  const ONE_ETH = new BN("1000000000000000000");
  console.log(`Assessing gas for: ${functionName}`);

  const gasUsed = receipt.receipt.gasUsed;
  console.log(`GasUsed: ${gasUsed}`);

  console.log(`------Cost for ETH Mainnet------`);
  console.log(`gas price gwei: ${ethGasPriceGwei}`);
  const totalCostEth = new BN(gasUsed).mul(
    new BN(ethGasPriceGwei).mul(ONE_GWEI)
  );
  console.log(`USD Price: $${ethPriceUsd}`);
  const ethCost =
    Number(
      totalCostEth
        .mul(new BN(ethPriceUsd))
        .mul(new BN(100))
        .div(ONE_ETH)
    ) / 100;
  console.log(`Cost on ETH Mainnet: $${ethCost}`);

  console.log(`------Cost for BSC ------`);
  console.log(`gas price gwei: ${bnbGasPriceGwei}`);
  const totalCostBsc = new BN(gasUsed).mul(
    new BN(bnbGasPriceGwei).mul(ONE_GWEI)
  );
  console.log(`BNB Price: $${bnbPriceUsd}`);
  const bscCost =
    Number(
      totalCostBsc
        .mul(new BN(bnbPriceUsd))
        .mul(new BN(100))
        .div(ONE_ETH)
    ) / 100;
  console.log(`Cost on BSC: $${bscCost}`);
};

module.exports = {
  initialize,
  mintAndApprove,
  SIMULATED_INSTANT_APY,
  simulateInterestEarned,
  tokenPriceCalculator,
  simulateTotalValueWithInterest,
  feeCalculation,
  createSynthetic,
  logGasPrices,
};
