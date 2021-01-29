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
// Load zos scripts and truffle wrapper function
const { scripts, ConfigManager } = require("@openzeppelin/cli");
const { add, push, create } = scripts;

const SIMULATED_INSTANT_APY = 10;

const deployContracts = async (options, accounts) => {
  add({
    contractsData: [
      { name: "LongShort", alias: "LongShort" },
      // { name: "LongCoins", alias: "LongCoins" },
      // { name: "ShortCoins", alias: "ShortCoins" },
      // { name: "Dai", alias: "Dai" },
      // { name: "ADai", alias: "ADai" },
    ],
  });
  await push({ ...options, force: true });

  // Long and short coins.
  await deployer.deploy(LongCoins);
  let long = await LongCoins.deployed();

  await deployer.deploy(ShortCoins);
  let short = await ShortCoins.deployed();

  // Dai
  await deployer.deploy(Dai);
  let dai = await Dai.deployed();

  // aDai
  await deployer.deploy(ADai, dai.address);
  let aDai = await ADai.deployed();

  await dai.setup("dai token", "DAI", aDai.address);

  // Hack this is result of keccak("MINTER_ROLE")
  const minterRoleId =
    "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";
  await dai.grantRole(minterRoleId, aDai.address);

  // aave lending pool
  await deployer.deploy(
    AaveLendingPool,
    aDai.address,
    dai.address,
    SIMULATED_INSTANT_APY
  );
  const aaveLendingPool = await AaveLendingPool.deployed();

  await deployer.deploy(LendingPoolAddressesProvider, aaveLendingPool.address);

  const priceOracle = await deployer.deploy(PriceOracle, "1000000000000000000");

  const _baseEntryFee = 10;
  const _entryFeeMultiplier = 100;
  const _baseExitFee = 50;
  const _badLiquidityExitFee = 50;

  const longShort = await create({
    ...options,
    contractAlias: "LongShort",
    methodName: "setup",
    methodArgs: [
      long.address,
      short.address,
      dai.address,
      aDai.address,
      LendingPoolAddressesProvider.address,
      priceOracle.address,
      _baseEntryFee,
      _entryFeeMultiplier,
      _baseExitFee,
      _badLiquidityExitFee,
    ],
  });

  await long.setup("long tokens", "LONG", longShort.address);
  await short.setup("short tokens", "SHORT", longShort.address);
};

module.exports = async function(deployer, networkName, accounts) {
  deployer.then(async () => {
    // Don't try to deploy/migrate the contracts for tests
    if (networkName === "test") {
      return;
    }
    const { network, txParams } = await ConfigManager.initNetworkConfiguration({
      network: networkName,
      from: accounts[0],
    });
    await deploy({ network, txParams }, accounts);
  });
};
