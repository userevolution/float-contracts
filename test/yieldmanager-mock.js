const { BN } = require("@openzeppelin/test-helpers");
const { initialize, mintAndApprove, createSynthetic } = require("./helpers");

const YieldManager = artifacts.require("YieldManagerMock");

contract("YieldManagerMock", (accounts) => {
  let yieldManager;
  let token;

  // Constants for fake underlying token.
  const syntheticName = "FTSE100";
  const syntheticSymbol = "FTSE";

  // Test users.
  const admin = accounts[0];
  const user = accounts[1];

  // Utility bignum.js constants.
  const fifty = new BN("50000000000000000000");
  const oneHundred = new BN("100000000000000000000");
  const oneHundredTen = new BN("110000000000000000000");
  const oneTenth = new BN("100000000000000000");

  beforeEach(async () => {
    const result = await initialize(admin);
    longShort = result.longShort;

    // New yield manager with "longShort" proxied to user.
    yieldManager = await YieldManager.new({ from: admin });
    await yieldManager.setup(admin, user, { from: admin });

    // Create synthetic tokens for yield manager.
    const synthResult = await createSynthetic(
      admin,
      longShort,
      syntheticName,
      syntheticSymbol,
      0, // no fees for testing
      0,
      0,
      0
    );

    // Mint some of these tokens for the user.
    token = synthResult.fundToken;
    await token.mint(user, oneHundred);
    await token.approve(yieldManager.address, oneHundred, {
      from: user,
    });

    // Deposit them into the yield manager.
    await yieldManager.depositToken(token.address, oneHundred, {
      from: user,
    });
  });

  it("depositing into yield manager sets correct holdings", async () => {
    // Should be 100 tokens in the yield manager after beforeEach().
    var totalHeld = await yieldManager.totalHeld.call(token.address);
    assert.equal(
      totalHeld.toString(),
      oneHundred.toString(),
      "Yield manager held wrong token value after deposit."
    );

    // User should have no tokens left after beforeEach().
    var userHeld = await token.balanceOf(user);
    assert.equal(
      userHeld.toString(),
      "0",
      "User held wrong token value after deposit."
    );
  });

  it("withdrawing from yield manager sets correct holdings", async () => {
    await yieldManager.withdrawDepositToken(token.address, fifty, {
      from: user,
    });

    // Should be 50 tokens in the yield manager after withdrawal.
    var totalHeld = await yieldManager.totalHeld.call(token.address);
    assert.equal(
      totalHeld.toString(),
      fifty.toString(),
      "Yield manager held wrong token value after withdrawal."
    );

    // User should have 50 tokens left after withdrawal.
    var userHeld = await token.balanceOf(user);
    assert.equal(
      userHeld.toString(),
      fifty.toString(),
      "User held wrong token value after withdrawal."
    );
  });

  it("settling with yield increases holdings", async () => {
    await yieldManager.settleWithYield(token.address, oneTenth, {
      from: admin,
    });

    // Should be 110 tokens in yield manager after settling.
    var totalHeld = await yieldManager.totalHeld.call(token.address);
    assert.equal(
      totalHeld.toString(),
      oneHundredTen.toString(),
      "Yield manager held wrong token value after settlement."
    );
  });

  it("getTotalHeld should agree with actual holdings", async () => {
    var getTotalHeld = await yieldManager.getTotalHeld(token.address);
    var totalHeld = await yieldManager.totalHeld.call(token.address);
    assert.equal(
      getTotalHeld.toString(),
      totalHeld.toString(),
      "getTotalHeld doesn't agree with actual holdings"
    );
  });
});
