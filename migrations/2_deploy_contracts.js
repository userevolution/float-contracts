// Load zos scripts and truffle wrapper function
const { scripts, ConfigManager } = require("@openzeppelin/cli");
const { add, push, create } = scripts;

const STAKER = "Staker";
const FLOAT_TOKEN = "FloatToken";
const TOKEN_FACTORY = "TokenFactory";
const SYNTHETIC_TOKEN = "Dai";
const ORACLE_AGGREGATOR = "OracleManagerMock";

const LongShort = artifacts.require("LongShort");
const Staker = artifacts.require(STAKER);
const Dai = artifacts.require(SYNTHETIC_TOKEN);
const FloatToken = artifacts.require(FLOAT_TOKEN);
const TokenFactory = artifacts.require(TOKEN_FACTORY);
const OracleManagerMock = artifacts.require(ORACLE_AGGREGATOR);

const deployContracts = async (options, accounts, deployer, networkName) => {
  const admin = accounts[0];

  // No contract migrations for testing.
  if (networkName === "test") {
    return;
  }

  // Handles idempotent deployments for upgradeable contracts using zeppelin.
  // The contract name can change, but alias must remain constant across
  // deployments. Use create(...) to deploy a proxy for an alias.
  add({
    contractsData: [
      { name: "LongShort", alias: "LongShort" },
      { name: ORACLE_AGGREGATOR, alias: "OracleAggregator" },
      { name: STAKER, alias: "Staker" },
    ],
  });
  await push({ ...options, force: true });

  // We use actual bUSD for the BSC testnet instead of fake DAI.
  if (networkName != "binanceTest") {
    await deployer.deploy(Dai);
    let dai = await Dai.deployed();
    await dai.initialize("dai token", "DAI");
  }

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
    contractAlias: "OracleAggregator",
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

module.exports = async function(deployer, networkName, accounts) {
  deployer.then(async () => {
    // Initialise openzeppelin for upgradeable contracts.
    const options = await ConfigManager.initNetworkConfiguration({
      network: networkName,
      from: accounts[0],
    });

    await deployContracts(options, accounts, deployer, networkName);
  });
};
