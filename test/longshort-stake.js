const {
  BN,
  expectRevert,
  ether,
  expectEvent,
  balance,
  time,
} = require("@openzeppelin/test-helpers");

const { inTransaction } = require("@openzeppelin/test-helpers/src/expectEvent");
const { assert, expect } = require("chai");

const { initialize, mintAndApprove, createSynthetic } = require("./helpers");

contract("LongShort (staking)", (accounts) => {
  const syntheticName = "FTSEoneHundred";
  const syntheticSymbol = "FTSE";

  // Default test values
  const admin = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  const user3 = accounts[3];

  const fifty = "50000000000000000000";
  const oneHundred = "1000000000000000000";
  const threeHundred = "3000000000000000000";
  const oneHundredAndFifty = "150000000000000000000";
  const twoHundred = "200000000000000000000";
  const e18 = new BN("10000000000000000");
  const twentyFive = "25000000000000000000";

  let staker;
  let longShort;
  let longToken;
  let shortToken;
  let marketIndex;
  let fundToken;
  let floatToken;
  beforeEach(async () => {
    const result = await initialize(admin);
    longShort = result.longShort;
    staker = result.staker;
    floatToken = result.floatToken;
    // no fees
    const r2 = await createSynthetic(
      admin,
      longShort,
      syntheticName,
      syntheticSymbol,
      0,
      0,
      0,
      0
    );

    longToken = r2.longToken;
    shortToken = r2.shortToken;
    marketIndex = r2.currentMarketIndex;
    fundToken = r2.fundToken;
  });

  it("users can stake long tokens", async () => {
    await mintThenStake(oneHundred, longToken, user1);
    await mintAndStake(oneHundred, longToken, user2);
    await mintThenStakeImmediately(oneHundred, longToken, user3);

    const u1staked = await amountStaked(longToken, user1);
    const u2staked = await amountStaked(longToken, user2);
    const u3staked = await amountStaked(longToken, user3);

    assert.equal(new BN(oneHundred).toString(), u1staked.toString());
    assert.equal(new BN(oneHundred).toString(), u2staked.toString());
    assert.equal(new BN(oneHundred).toString(), u3staked.toString());
  });

  it("users can stake short tokens", async () => {
    await mintThenStake(oneHundred, shortToken, user1);
    await mintThenStakeImmediately(oneHundred, shortToken, user2);
    await mintAndStake(oneHundred, shortToken, user3);

    const u1staked = await amountStaked(shortToken, user1);
    const u2staked = await amountStaked(shortToken, user2);
    const u3staked = await amountStaked(shortToken, user3);

    assert.equal(new BN(oneHundred).toString(), u1staked.toString());
    assert.equal(new BN(oneHundred).toString(), u2staked.toString());
    assert.equal(new BN(oneHundred).toString(), u3staked.toString());
  });

  it("users must wait to earn float", async () => {
    await mintThenStake(oneHundred, longToken, user1);
    await staker.withdraw(longToken.address, new BN(oneHundred), {
      from: user1,
    });

    await mintAndStake(oneHundred, longToken, user2);
    await staker.withdraw(longToken.address, new BN(oneHundred), {
      from: user2,
    });

    await mintThenStake(oneHundred, longToken, user3);
    await staker.withdraw(longToken.address, new BN(oneHundred), {
      from: user3,
    });

    const u1Float = await floatToken.balanceOf(user1);

    const u2Float = await floatToken.balanceOf(user2);

    const u3Float = await floatToken.balanceOf(user3);

    const zero = new BN("0").toString();
    assert.equal(zero, u1Float.toString());
    assert.equal(zero, u2Float.toString());
    assert.equal(zero, u3Float.toString());
  });

  it("case 1:  users can earn float with a delay from a long stake", async () => {
    await basicFloatAccumulationTest(mintThenStake, longToken, 2);
  });

  it("case 2:  users can earn float immediately from a long stake", async () => {
    await basicFloatAccumulationTest(mintThenStakeImmediately, longToken, 1);
  });

  it("case 3:  users can earn float immediately from a long mint", async () => {
    await basicFloatAccumulationTest(mintAndStake, longToken, 1);
  });

  it("case 1:  users can earn float with a delay from from a short stake", async () => {
    await basicFloatAccumulationTest(mintThenStake, shortToken, 2);
  });

  it("case 2:  users can earn float immediately from a short stake", async () => {
    await basicFloatAccumulationTest(mintThenStakeImmediately, shortToken, 1);
  });

  it("case 3:  users can earn float immediately from a short mint", async () => {
    await basicFloatAccumulationTest(mintAndStake, shortToken, 1);
  });

  it("staker admin can change", async () => {
    await expectRevert.unspecified(
      staker.changeAdmin(user2, { from: user2 }),
      "not admin"
    );
    await staker.changeAdmin(user2, {
      from: admin,
    });
    const a = await staker.admin.call();
    assert.equal(user2, a);
  });

  it("users who have no stake cannot withdraw", async () => {
    expectRevert.unspecified(
      staker.withdraw(longToken.address, new BN(oneHundred), {
        from: user1,
      })
    );
  });

  it("restaking credits you your float", async () => {
    await mintAndApprove(
      fundToken,
      new BN(oneHundredAndFifty),
      user1,
      longShort.address
    );
    await longShort.mintLong(marketIndex, new BN(oneHundredAndFifty), {
      from: user1,
    });
    await longToken.approve(staker.address, oneHundredAndFifty, {
      from: user1,
    });
    await staker.stake(longToken.address, oneHundred, { from: user1 });

    await time.increase(1);
    await longShort._updateSystemState(marketIndex);

    const before = await time.latest();
    await time.increase(1);
    await longShort._updateSystemState(marketIndex);
    // earning from now
    const now = await time.latest();

    price = await longShort.longTokenPrice(marketIndex);
    await staker.stake(longToken.address, twentyFive, { from: user1 });

    const result = await floatToken.balanceOf(user1);

    // case 1: accumulated float credited
    assert.equal(
      result.toString(),
      calculateFloatPerSecond(price)
        .mul(new BN((now - before).toString()))
        .mul(new BN(oneHundred))
        .toString()
    );

    await staker.stake(longToken.address, twentyFive, { from: user1 });
    const r2 = await floatToken.balanceOf(user1);

    // case 2: not long enough for float to have been credited
    assert.equal(
      r2.toString(),
      calculateFloatPerSecond(price)
        .mul(new BN((now - before).toString()))
        .mul(new BN(oneHundred))
        .toString()
    );
  });

  it("float earned is a function of time staked", async () => {
    await mintAndApprove(
      fundToken,
      new BN(oneHundred),
      user1,
      longShort.address
    );
    await longShort.mintLong(marketIndex, new BN(oneHundred), {
      from: user1,
    });
    await longToken.approve(staker.address, oneHundred, {
      from: user1,
    });
    await staker.stake(longToken.address, oneHundred, { from: user1 });

    await time.increase(1);
    await longShort._updateSystemState(marketIndex);

    const before = await time.latest();
    await time.increase(1);
    await longShort._updateSystemState(marketIndex);

    await time.increase(1);
    await longShort._updateSystemState(marketIndex);
    // earning from now
    const now = await time.latest();

    let { price } = await getFloatPerSecondParameters(longToken);
    await staker.withdraw(longToken.address, new BN(oneHundred), {
      from: user1,
    });
    const result = await floatToken.balanceOf(user1);

    assert.equal(
      result.toString(),
      calculateFloatPerSecond(price)
        .mul(new BN((now - before).toString()))
        .mul(new BN(oneHundred))
        .toString()
    );
  });

  const basicFloatAccumulationTest = async (fn, token, iterations) => {
    await fn(oneHundred, token, user1);
    for (let i = 0; i < iterations - 1; i++) {
      await time.increase(1);
      await longShort._updateSystemState(marketIndex);
    }
    const before = await time.latest();
    await time.increase(1);
    await longShort._updateSystemState(marketIndex);
    // earning from now
    const now = await time.latest();

    const { price } = await getFloatPerSecondParameters(token);

    await staker.withdraw(token.address, new BN(oneHundred), {
      from: user1,
    });
    const result = await floatToken.balanceOf(user1);

    assert.equal(
      result.toString(),
      calculateFloatPerSecond(price)
        .mul(new BN((now - before).toString()))
        .mul(new BN(oneHundred))
        .toString()
    );
  };

  // mock for now, update once we change r
  const getFloatPerSecondParameters = async (token, staker) => {
    let price;
    if (token.address == longToken.address) {
      price = await longShort.longTokenPrice(marketIndex);
    } else {
      price = await longShort.longTokenPrice(marketIndex);
    }
    return {
      price,
    };
  };

  // mock for now - will have to refactor tests once we change how
  // r is calculated
  const calculateFloatPerSecond = (tokenPrice) => tokenPrice;

  const amountStaked = async (token, user) =>
    await staker.userAmountStaked(token.address, user);

  const mintThenStake = async (amount, token, user) => {
    await mintAndApprove(fundToken, amount, user, longShort.address);
    conditionalMint(token, amount, user);
    await token.approve(staker.address, amount, { from: user });
    await staker.stake(token.address, amount, { from: user });
  };

  const mintThenStakeImmediately = async (amount, token, user) => {
    await mintAndApprove(fundToken, amount, user, longShort.address);
    await conditionalMint(token, amount, user);
    await token.approve(staker.address, amount, { from: user });
    await staker.stakeAndEarnImmediately(token.address, amount, { from: user });
  };

  const mintAndStake = async (amount, token, user) => {
    await mintAndApprove(fundToken, new BN(amount), user, longShort.address);
    if (token.address === longToken.address) {
      await longShort.mintLongAndStake(marketIndex, new BN(amount), {
        from: user,
      });
    } else {
      await longShort.mintShortAndStake(marketIndex, new BN(amount), {
        from: user,
      });
    }
  };

  const conditionalMint = async (token, amount, user) => {
    if (token.address === longToken.address) {
      await longShort.mintLong(marketIndex, new BN(amount), {
        from: user,
      });
    } else {
      await longShort.mintShort(marketIndex, new BN(amount), {
        from: user,
      });
    }
  };
});
