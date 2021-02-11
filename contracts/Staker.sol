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
    mapping(address => uint256) public accumulatedFloat;
    mapping(address => mapping(address => uint256)) public userAmountStaked; // synthetic token type -> user -> amount staked
    mapping(address => mapping(address => uint256))
        public userIndexOfLastClaimedReward;

    struct RewardState {
        uint256 timestamp;
        uint256 accumulativeFloatPerSecond;
    }
    // token address -> state index -> float reward state
    mapping(address => mapping(uint256 => RewardState))
        public syntheticRewardParams;
    // token address -> last state reward index set
    mapping(address => uint256) public latestRewardIndex;

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

        syntheticRewardParams[longTokenAddress][0].timestamp = block.timestamp;
        syntheticRewardParams[longTokenAddress][0]
            .accumulativeFloatPerSecond = 0;

        syntheticRewardParams[shortTokenAddress][0].timestamp = block.timestamp;
        syntheticRewardParams[shortTokenAddress][0]
            .accumulativeFloatPerSecond = 0;
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
            syntheticRewardParams[tokenAddress][latestRewardIndex[tokenAddress]]
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
            syntheticRewardParams[tokenAddress][latestRewardIndex[tokenAddress]]
                .accumulativeFloatPerSecond
                .add(timeDelta.mul(floatPerSecond));
    }

    function setRewardObjects(address tokenAddress, uint256 tokenPrice)
        internal
    {
        uint256 newIndex = latestRewardIndex[tokenAddress] + 1;
        // Set accumulative
        syntheticRewardParams[tokenAddress][newIndex]
            .accumulativeFloatPerSecond = calculateNewAccumulative(
            tokenAddress,
            tokenPrice
        );
        // set timestsamp
        syntheticRewardParams[tokenAddress][newIndex].timestamp = block
            .timestamp;
        // set next index
        latestRewardIndex[tokenAddress] = newIndex;
    }

    function addNewStateForFloatRewards(
        address longTokenAddress,
        address shortTokenAddress,
        uint256 longTokenPrice,
        uint256 shortTokenPrice,
        uint256 longValue,
        uint256 shortValue
    ) external onlyFloat {
        // If this is the first update this block
        // calculate the accumulative.
        if (calculateTimeDelta(longTokenAddress) != 0) {
            setRewardObjects(longTokenAddress, longTokenPrice);
            setRewardObjects(shortTokenAddress, shortTokenPrice);
        }
    }

    function calculateAccumulatedFloat(address tokenAddress)
        internal
        returns (uint256)
    {
        uint256 accumDelta =
            syntheticRewardParams[tokenAddress][latestRewardIndex[tokenAddress]]
                .accumulativeFloatPerSecond
                .sub(
                syntheticRewardParams[tokenAddress][
                    userIndexOfLastClaimedReward[tokenAddress][msg.sender]
                ]
                    .accumulativeFloatPerSecond
            );

        return accumDelta * userAmountStaked[tokenAddress][msg.sender];
    }

    function creditAccumulatedFloat(address fundAdress) internal {
        uint256 accumulatedFloat = calculateAccumulatedFloat(fundAdress);
        // Set the user has claimed up until now.
        userIndexOfLastClaimedReward[fundAddress][
            msg.sender
        ] = latestRewardIndex[tokenAddress];

        // Add float to their balance.
        accumulatedFloat[msg.sender] =
            accumulatedFloat[msg.sender] +
            accumulatedFloat;
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

        // If they already have staked, calculate and award them their float.
        if (userAmountStaked[fundAddress][msg.sender] > 0) {
            creditAccumulatedFloat(fundAddress);
        }

        userAmountStaked[fundAddress][msg.sender] = userAmountStaked[
            fundAddress
        ][msg.sender]
            .add(amount);

        // We are currently smashing them out of earnings till the next state update.
        // Figure out what happens when they fall inbetween state updates.
        // Note this also effects top up people.
        userIndexOfLastClaimedReward[fundAddress][msg.sender] =
            latestRewardIndex[tokenAddress] +
            1;
        // User starts earning from next update state object.
        // Currently imperfect.

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

    /*
    Mint function.
    Decide whether internal and when to use.
    */
    function mintFloat() external {
        require(accumulatedFloat[msg.sender] > 0, "no float");
        uint256 floatToMint = accumulatedFloat[msg.sender];
        accumulatedFloat[msg.sender] = 0;
        // mint and send user floatToMint
    }
}
