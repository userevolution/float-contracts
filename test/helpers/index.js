const { BN } = require("@openzeppelin/test-helpers");
// const { time } = require("@openzeppelin/test-helpers");

const LONGSHORT_CONTRACT_NAME = "LongShort";
const ERC20_CONTRACT_NAME = "ERC20PresetMinterPauserUpgradeSafe";
const PRICE_ORACLE_NAME = "PriceOracle";
const LONG_COINS = "LongCoins";
// const AAVE_LENDING_POOL = "AaveLendingPool";
// const LENDING_POOL_ADDRESS_PROVIDER = "LendingPoolAddressesProvider";
// const ADAI = "ADai";
const SIMULATED_INSTANT_APY = 10;

const LongShort = artifacts.require(LONGSHORT_CONTRACT_NAME);
const erc20 = artifacts.require(LONG_COINS);
const PriceOracle = artifacts.require(PRICE_ORACLE_NAME);
// const AaveLendingPool = artifacts.require(AAVE_LENDING_POOL);
// const LendingPoolAddressProvider = artifacts.require(
//   LENDING_POOL_ADDRESS_PROVIDER
// );
//const ADai = artifacts.require(ADAI);

const initialize = async (admin) => {
  return initializeWithFeeArguments(admin);
};

const initializeWithFeeArguments = async (admin) => {
  // Long and short coins.
  // const long = await erc20.new({
  //   from: admin,
  // });
  // const short = await erc20.new({
  //   from: admin,
  // });

  // Dai
  const dai = await erc20.new({
    from: admin,
  });

  // aDai
  // aDai = await ADai.new(dai.address, {
  //   from: admin,
  // });

  await dai.initialize("dai token", "DAI", {
    from: admin,
  });
  // Hack this is result of keccak("MINTER_ROLE")
  //"0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6"
  // await dai.grantRole(
  //   "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6",
  //   aDai.address,
  //   { from: admin }
  // );

  // aave lending pool
  // aaveLendingPool = await AaveLendingPool.new(
  //   aDai.address,
  //   dai.address,
  //   SIMULATED_INSTANT_APY,
  //   {
  //     from: admin,
  //   }
  // );

  // lendingPoolAddressProvider = await LendingPoolAddressProvider.new(
  //   aaveLendingPool.address,
  //   {
  //     from: admin,
  //   }
  // );

  // const priceOracle = await PriceOracle.new("1000000000000000000", {
  //   from: admin,
  // });

  const longShort = await LongShort.new({
    from: admin,
  });

  await longShort.setup(dai.address, {
    from: admin,
  });

  // await long.setup("long tokens", "LONG", longShort.address, {
  //   from: admin,
  // });
  // await short.setup("short tokens", "SHORT", longShort.address, {
  //   from: admin,
  // });

  return {
    dai,
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

module.exports = {
  initialize,
  ERC20_CONTRACT_NAME,
  mintAndApprove,
  SIMULATED_INSTANT_APY,
  simulateInterestEarned,
  tokenPriceCalculator,
  simulateTotalValueWithInterest,
  feeCalculation,
  initializeWithFeeArguments,
};
