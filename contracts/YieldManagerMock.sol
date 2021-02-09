pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

import "@openzeppelin/contracts-ethereum-package/contracts/presets/ERC20PresetMinterPauser.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";

import "./interfaces/IYieldManager.sol";

/*
Thoughts for the mock:
* Should accept multiple erc20 tokens

Thought, for contract testing we likely want a small yield increase per transaction.
But for UI testing, we want yield to be earned smoothly over time.
Maybe solution is to have a combination of both.

I do think it is a good thing to test that the yield could increase between two transactions in the same block
  (which should be possible with current lending markets since interactions with the yield platform can happen inbetween)
 */
contract YieldManagerMock is IYieldManager, Initializable {
    using SafeMath for uint256;

    address public admin;
    address public longShortContract;

    uint256 public constant interestScalarDenominator = 10e18; // = 10^9

    mapping(address => uint256) public totalHeld;
    mapping(address => uint256) public interestScalarTime;
    mapping(address => uint256) public timeYieldWasLastSettled;

    modifier adminOnly() {
        require(msg.sender == admin, "Not admin");
        _;
    }
    modifier longShortOnly() {
        require(msg.sender == longShortContract, "Not longShort");
        _;
    }

    function setup(address _admin, address _longShort) public initializer {
        admin = _admin;
        longShortContract = _longShort;
    }

    function setYieldRateIncreaseForNextQuery(
        address tokenAddress,
        uint256 percentage
    ) public adminOnly {
        uint256 currentTotalHeld = getTotalHeld(tokenAddress);
        totalHeld[tokenAddress] = currentTotalHeld.add(
            currentTotalHeld.mul(percentage).div(interestScalarDenominator)
        );
        timeYieldWasLastSettled[tokenAddress] = now;
    }

    function setYieldRateIncreasePerSecond(
        address tokenAddress,
        uint256 newPercentage
    ) public adminOnly {
        setYieldRateIncreaseForNextQuery(tokenAddress, 0);

        interestScalarTime[tokenAddress] = newPercentage;
    }

    function depositToken(address erc20Token, uint256 amount)
        public
        override
        longShortOnly
    {
        // erc20Token.burn()
    }

    // Note, it is possible that this won't be able to withdraw the underlying token - so it may have to give the user the interest bearing token
    function withdrawDepositToken(address erc20Token, uint256 amount)
        public
        override
        longShortOnly
        returns (address tokenWithdrawn, uint256 amountWithdrawn)
    {
        // token.mint(receiverOfTokens, amountToMintForUser);
    }

    function getTotalHeld(address erc20Token)
        public
        view
        override
        returns (uint256 amount)
    {
        return
            totalHeld[erc20Token].add(
                totalHeld[erc20Token]
                    .mul(
                    interestScalarTime[erc20Token].mul(
                        now.sub(timeYieldWasLastSettled[erc20Token])
                    )
                )
                    .div(interestScalarDenominator)
            );
    }
}
