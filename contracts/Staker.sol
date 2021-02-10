pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/presets/ERC20PresetMinterPauser.sol";
import "./LongShort.sol";

/*
    ###### Purpose of contract ########
    This smart contract allows users to securely stake fTokens
    that represent their synthetic exposure.

    Staking sythentic tokens will ensure that the liquidity of the
    synthetic market is increased, and entitle users to FLOAT rewards.
*/

/** @title Staker Contract (name is WIP) */
contract Staker is Initializable {
    using SafeMath for uint256;

    ////////////////////////////////////
    //////// VARIABLES /////////////////
    ////////////////////////////////////

    ///////// Global ///////////
    address public admin;
    mapping(address => bool) syntheticValid;

    ///////// User Specific ///////////
    mapping(address => mapping(address => uint256)) public userAmountStaked; // synthetic token type -> user -> amount staked
    mapping(address => mapping(address => uint256)) public userTimestampOfStake; // synthetic token -> user -> avaiable withdrawl time
    // More state needed here.
    // mapping(address => mapping(address => uint256)) public userLastMintTime; // synthetic token -> user -> Last time of mint

    // Keep track of user latest starting reward state. (index)
    // User last end reward state (index)

    struct RewardState {
        uint256 timestamp;
        uint256 accumulativeFloatPerSecond;
    }
    // token address -> state index -> float reward state
    mapping(address => mapping(uint256 => RewardState))
        public syntheticRewardParams;
    // token address -> last state reward index set
    mapping(address => uint256) public nextRewardIndex;

    ///////// LongShort Contract ///////////
    LongShort public floatContract;

    ////////////////////////////////////
    /////////// EVENTS /////////////////
    ////////////////////////////////////

    event DeployV0();

    ////////////////////////////////////
    /////////// MODIFIERS //////////////
    ////////////////////////////////////

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    modifier onlyValidSynthetic(address _synthAddress) {
        require(syntheticValid[_synthAddress], "not valid synth");
        _;
    }

    modifier onlyFloat() {
        require(msg.sender == address(floatContract));
        _;
    }

    ////////////////////////////////////
    ///// CONTRACT SET-UP //////////////
    ////////////////////////////////////

    function initialize(address _admin, address _floatContract)
        public
        initializer
    {
        admin = _admin;
        floatContract = LongShort(_floatContract);

        emit DeployV0();
    }

    ////////////////////////////////////
    /// MULTISIG ADMIN FUNCTIONS ///////
    ////////////////////////////////////

    function changeAdmin(address _admin) external onlyAdmin {
        admin = _admin;
    }

    ////////////////////////////////////
    /////////// STAKING SETUP //////////
    ////////////////////////////////////

    function addNewStakingFund(
        address longTokenAddress,
        address shortTokenAddress
    ) external onlyFloat {
        // use market index for time and
        syntheticValid[longTokenAddress] = true;
        syntheticValid[shortTokenAddress] = true;
        // Implement adding the new synthetic here.

        // Adding intital synthetic reward params.
        // nextRewardIndex
        syntheticRewardParams[longTokenAddress][0].timestamp = block.timestamp;
        syntheticRewardParams[longTokenAddress][0]
            .accumulativeFloatPerSecond = 0;

        syntheticRewardParams[shortTokenAddress][0].timestamp = block.timestamp;
        syntheticRewardParams[shortTokenAddress][0]
            .accumulativeFloatPerSecond = 0;

        nextRewardIndex[longTokenAddress] = 1;
        nextRewardIndex[shortTokenAddress] = 1;
    }

    ////////////////////////////////////
    /////////// HELPER FUNCTIONS ///////
    ////////////////////////////////////

    function calculateFloatPerSecond(uint256 tokenPrice)
        internal
        view
        returns (uint256)
    {
        // Note this function will be depedant on other things.
        // I.e. See latex paper for full details
        // Lets assume𝑟is some function of
        // 1)  the order book imbalance
        // 2)  the price of the token stake
        // (3)  perhaps time (awarding early adopters more)
        // (4)  Perhaps which market
        // (5)  scalar for imbalance
        // (6) amount already locked from that token
        return tokenPrice;
    }

    function calculateTimeDelta(address tokenAddress)
        internal
        view
        returns (uint256)
    {
        return
            block.timestamp -
            syntheticRewardParams[tokenAddress][
                nextRewardIndex[tokenAddress] - 1
            ]
                .timestamp;
    }

    function calculateNewAccumulative(address tokenAddress, uint256 tokenPrice)
        internal
        view
        returns (uint256)
    {
        uint256 floatPerSecond = calculateFloatPerSecond(tokenPrice);
        uint256 timeDelta = calculateTimeDelta(tokenAddress);
        return
            syntheticRewardParams[tokenAddress][
                nextRewardIndex[tokenAddress] - 1
            ]
                .accumulativeFloatPerSecond
                .add(timeDelta.mul(floatPerSecond));
    }

    function addNewStateForFloatRewards(
        address longTokenAddress,
        address shortTokenAddress,
        uint256 longTokenPrice,
        uint256 shortTokenPrice,
        uint256 longValue,
        uint256 shortValue
    ) external onlyFloat {
        syntheticRewardParams[longTokenAddress][
            nextRewardIndex[longTokenAddress]
        ]
            .accumulativeFloatPerSecond = calculateNewAccumulative(
            longTokenAddress,
            longTokenPrice
        );

        syntheticRewardParams[shortTokenAddress][
            nextRewardIndex[shortTokenAddress]
        ]
            .accumulativeFloatPerSecond = calculateNewAccumulative(
            shortTokenAddress,
            shortTokenPrice
        );

        // If this is the first update this block
        // then set the new timestamp and increment index.
        if (calculateTimeDelta(longTokenAddress) != 0) {
            // set timestamp
            syntheticRewardParams[longTokenAddress][
                nextRewardIndex[longTokenAddress]
            ]
                .timestamp = block.timestamp;

            // set timestamp
            syntheticRewardParams[shortTokenAddress][
                nextRewardIndex[shortTokenAddress]
            ]
                .timestamp = block.timestamp;

            // Increase the index for state.
            nextRewardIndex[longTokenAddress] =
                nextRewardIndex[longTokenAddress] +
                1;
            nextRewardIndex[shortTokenAddress] =
                nextRewardIndex[shortTokenAddress] +
                1;
        }
    }

    ////////////////////////////////////
    /////////// STAKING ////////////////
    ////////////////////////////////////

    /*
    Staking function. 
    */
    function stake(address fundAddress, uint256 amount)
        external
        onlyValidSynthetic(fundAddress)
    {
        ERC20PresetMinterPauserUpgradeSafe(fundAddress).transferFrom(
            msg.sender,
            address(this),
            amount
        );

        userAmountStaked[fundAddress][msg.sender] = userAmountStaked[
            fundAddress
        ][msg.sender]
            .add(amount);
        userTimestampOfStake[fundAddress][msg.sender] = block.timestamp;

        // Update token generation itntervals
        // Update time of last mint.
        // Mint FLOAT tokens, send if already staked before and owed FLOAT
    }

    ////////////////////////////////////
    /////////// WITHDRAW ///////////////
    ////////////////////////////////////

    /*
    Withdraw function
    */
    function withdraw(address fundAddress) external {
        require(
            userAmountStaked[fundAddress][msg.sender] > 0,
            "nothing to withdraw"
        );
        uint256 amount = userAmountStaked[fundAddress][msg.sender];
        userAmountStaked[fundAddress][msg.sender] = 0;
        ERC20PresetMinterPauserUpgradeSafe(fundAddress).transfer(
            msg.sender,
            amount
        );

        // Update token generation itntervals
        // Update time of last mint.
        // Mint FLOAT tokens, send
    }
}
