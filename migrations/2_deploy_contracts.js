const SYNTHETIC_TOKEN = "SyntheticToken";
const TOKEN_FACTORY = "TokenFactory";
const PRICE_ORACLE_NAME = "PriceOracle";

const LongShort = artifacts.require("LongShort");

const SyntheticToken = artifacts.require(SYNTHETIC_TOKEN);
const TokenFactory = artifacts.require(TOKEN_FACTORY);
const PriceOracle = artifacts.require(PRICE_ORACLE_NAME);

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
  await deployer.deploy(SyntheticToken);
  let dai = await SyntheticToken.deployed();

  await dai.initialize("dai token", "DAI");

  // const priceOracle = await deployer.deploy(PriceOracle, "1000000000000000000");

  const tokenFactory = await TokenFactory.new({
    from: admin,
  });

  const longShort = await create({
    ...options,
    contractAlias: "LongShort",
    methodName: "setup",
    methodArgs: [admin, dai.address, tokenFactory.address],
  });

  const longShortInstance = await LongShort.at(longShort.address);

  await tokenFactory.setup(admin, longShort.address, {
    from: admin,
  });
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
    await deployContracts({ network, txParams }, accounts, deployer);
  });
};
