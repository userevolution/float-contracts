const SYNTHETIC_TOKEN = "Dai";
const TOKEN_FACTORY = "TokenFactory";
const PRICE_ORACLE_NAME = "PriceOracle";
const STAKER = "Staker";
const FLOAT_TOKEN = "FloatToken";

const LongShort = artifacts.require("LongShort");

const Dai = artifacts.require(SYNTHETIC_TOKEN);
const TokenFactory = artifacts.require(TOKEN_FACTORY);
const PriceOracle = artifacts.require(PRICE_ORACLE_NAME);
const Staker = artifacts.require(STAKER);
const FloatToken = artifacts.require(FLOAT_TOKEN);

// Load zos scripts and truffle wrapper function
const { scripts, ConfigManager } = require("@openzeppelin/cli");
const { add, push, create } = scripts;

const SIMULATED_INSTANT_APY = 10;

const deployContracts = async (options, accounts, deployer) => {
  const admin = accounts[0];

  add({
    contractsData: [{ name: "LongShort", alias: "LongShort" }],
  });
  await push({ ...options, force: true });

  // Dai
  await deployer.deploy(Dai);
  let dai = await Dai.deployed();

  await dai.initialize("dai token", "DAI");

  const tokenFactory = await TokenFactory.new({
    from: admin,
  });

  const staker = await Staker.new({
    from: admin,
  });

  const floatToken = await FloatToken.new({
    from: admin,
  });

  const longShort = await create({
    ...options,
    contractAlias: "LongShort",
    methodName: "setup",
    methodArgs: [admin, tokenFactory.address, staker.address],
  });

  const longShortInstance = await LongShort.at(longShort.address);

  await tokenFactory.setup(admin, longShort.address, {
    from: admin,
  });

  await floatToken.setup("Float token", "FLOAT TOKEN", staker.address, {
    from: admin,
  });

  await staker.initialize(admin, longShort.address, floatToken.address, {
    from: admin,
  });
};

module.exports = async function (deployer, networkName, accounts) {
  deployer.then(async () => {
    // Don't try to deploy/migrate the contracts for tests
    if (networkName === "test") {
      return;
    }
    const { network, txParams } = await ConfigManager.initNetworkConfiguration({
      network: networkName,
      from: accounts[0],
    });
    await deployContracts({ network, txParams }, accounts, deployer);
  });
};
