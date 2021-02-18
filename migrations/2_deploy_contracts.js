const SYNTHETIC_TOKEN = "Dai";
const TOKEN_FACTORY = "TokenFactory";
const ORACLE_AGGREGATOR = "OracleManagerMock";
const STAKER = "Staker";
const FLOAT_TOKEN = "FloatToken";

const LongShort = artifacts.require("LongShort");

const Dai = artifacts.require(SYNTHETIC_TOKEN);
const TokenFactory = artifacts.require(TOKEN_FACTORY);
const OracleManagerMock = artifacts.require(ORACLE_AGGREGATOR);
const Staker = artifacts.require(STAKER);
const FloatToken = artifacts.require(FLOAT_TOKEN);

// Load zos scripts and truffle wrapper function
const { scripts, ConfigManager } = require("@openzeppelin/cli");
const { add, push, create } = scripts;

const deployContracts = async (options, accounts, deployer) => {
  const admin = accounts[0];

  add({
    contractsData: [
      { name: "LongShort", alias: "LongShort" },
      { name: ORACLE_AGGREGATOR, alias: "oracleAggregator" },
      { name: STAKER, alias: "Staker" },
    ],
  });
  await push({ ...options, force: true });

  // Dai
  await deployer.deploy(Dai);
  let dai = await Dai.deployed();

  await dai.initialize("dai token", "DAI");

  await deployer.deploy(TokenFactory);
  let tokenFactory = await TokenFactory.deployed();

  await deployer.deploy(FloatToken);
  let floatToken = await FloatToken.deployed();

  const staker = await create({
    ...options,
    contractAlias: "Staker",
  });
  const stakerInstance = await Staker.at(staker.address);

  const oracleAggregator = await create({
    ...options,
    contractAlias: "oracleAggregator",
  });
  const oracleAggregatorInstance = await OracleManagerMock.at(
    oracleAggregator.address
  );

  const longShort = await create({
    ...options,
    contractAlias: "LongShort",
    methodName: "setup",
    methodArgs: [
      admin,
      tokenFactory.address,
      staker.address,
      oracleAggregator.address,
    ],
  });

  const longShortInstance = await LongShort.at(longShort.address);

  await oracleAggregatorInstance.setup(admin, longShort.address, {
    from: admin,
  });

  await tokenFactory.setup(admin, longShort.address, {
    from: admin,
  });

  await floatToken.setup("Float token", "FLOAT TOKEN", staker.address, {
    from: admin,
  });

  await stakerInstance.initialize(
    admin,
    longShort.address,
    floatToken.address,
    {
      from: admin,
    }
  );
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
