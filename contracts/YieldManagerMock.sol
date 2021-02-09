pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

import "./SyntheticToken.sol";

/*
Thoughts for the mock:
* Should accept multiple erc20 tokens

Thought, for contract testing we likely want a small yield increase per transaction.
But for UI testing, we want yield to be earned smoothly over time.
Maybe solution is to have a combination of both.

I do think it is a good thing to test that the yield could increase between two transactions in the same block
  (which should be possible with current lending markets since interactions with the yield platform can happen inbetween)
 */
contract OracleManagerMock is Initializable {
    address public admin;
    address public longShortContract;

    uint256 public constant interestScalarDenominator = 1000000000; // = 10^9

    mapping(address => uint256) public totalHeld;
    mapping(address => uint256) public interestScalarQuery;
    mapping(address => uint256) public interestScalarTime;

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

    function setYieldRateIncreasePerQuery(
        address tokenAddress,
        uint256 newPercentage
    ) public adminOnly {
        interestScalarNumerator[tokenAddress] = newPercentage;
    }

    function setYieldRateIncreasePerSecond(
        address tokenAddress,
        uint256 newPercentage
    ) public adminOnly {
        interestScalarNumerator[tokenAddress] = newPercentage;
    }

    function depositToken(SyntheticToken erc20Token, uint256 amount)
        public
        longShortOnly
    {}

    function withdrawDepositToken(SyntheticToken erc20Token, uint256 amount)
        public
        longShortOnly
    {}
}
