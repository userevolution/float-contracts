pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/presets/ERC20PresetMinterPauser.sol";
import "./LongShort.sol";
import "./FloatToken.sol";

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
    FloatToken public floatToken;

    ////////////////////////////////////
    /////////// EVENTS /////////////////
    ////////////////////////////////////

    event DeployV0();
    event StateAdded(
        address tokenAddress,
        uint256 stateIndex,
        uint256 timestamp,
        uint256 accumulative
    );
    event StakeAdded(address user, address tokenAddress, uint256 amount);
    event StakeWithdrawn(address user, address tokenAddress, uint256 amount);
    event FloatMinted(address user, uint256 amount);
    event FloatAccumulated(address user, address tokenAddress, uint256 amount);

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

    function initialize(
        address _admin,
        address _floatContract,
        address _floatToken
    ) public initializer {
        admin = _admin;
        floatContract = LongShort(_floatContract);
        floatToken = FloatToken(_floatToken);
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
        syntheticValid[longTokenAddress] = true;
        syntheticValid[shortTokenAddress] = true;

        syntheticRewardParams[longTokenAddress][0].timestamp = block.timestamp;
        syntheticRewardParams[longTokenAddress][0]
            .accumulativeFloatPerSecond = 0;

        syntheticRewardParams[shortTokenAddress][0].timestamp = block.timestamp;
        syntheticRewardParams[shortTokenAddress][0]
            .accumulativeFloatPerSecond = 0;

        emit StateAdded(longTokenAddress, 0, block.timestamp, 0);
    }

    ////////////////////////////////////
    // GLOBAL REWARD STATE FUNCTIONS ///
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

        emit StateAdded(
            tokenAddress,
            newIndex,
            block.timestamp,
            syntheticRewardParams[tokenAddress][newIndex]
                .accumulativeFloatPerSecond
        );
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

    ////////////////////////////////////
    // USER REWARD STATE FUNCTIONS ///
    ////////////////////////////////////

    function calculateAccumulatedFloat(address tokenAddress)
        internal
        returns (uint256)
    {
        // Safe Math will make this fail in case users try to claim immediately after
        // after deposit before the next state is updated.
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

    function creditAccumulatedFloat(address tokenAddress) internal {
        uint256 additionalFloat = calculateAccumulatedFloat(tokenAddress);
        // Set the user has claimed up until now.
        userIndexOfLastClaimedReward[tokenAddress][
            msg.sender
        ] = latestRewardIndex[tokenAddress];

        // Add float to their balance.
        accumulatedFloat[msg.sender] =
            accumulatedFloat[msg.sender] +
            additionalFloat;

        emit FloatAccumulated(msg.sender, tokenAddress, additionalFloat);
    }

    ////////////////////////////////////
    /////////// STAKING ////////////////
    ////////////////////////////////////

    /*
    Staking function.
    User can stake (flexibly) and start earning float rewards.
    Only approved float synthetic tokens can be staked.
    Users can call this same function to "top-up" their stake.
    */
    function stake(address tokenAddress, uint256 amount)
        external
        onlyValidSynthetic(tokenAddress)
    {
        ERC20PresetMinterPauserUpgradeSafe(tokenAddress).transferFrom(
            msg.sender,
            address(this),
            amount
        );

        // If they already have staked, calculate and award them their float.
        if (userAmountStaked[tokenAddress][msg.sender] > 0) {
            if (
                userIndexOfLastClaimedReward[tokenAddress][msg.sender] <
                latestRewardIndex[tokenAddress]
            ) {
                creditAccumulatedFloat(tokenAddress);
                mintFloat();
            }
        }

        userAmountStaked[tokenAddress][msg.sender] = userAmountStaked[
            tokenAddress
        ][msg.sender]
            .add(amount);

        // We are currently smashing them out of earnings till the next state update.
        // Figure out what happens when they fall inbetween state updates.
        // Note this also effects top up people.
        userIndexOfLastClaimedReward[tokenAddress][msg.sender] =
            latestRewardIndex[tokenAddress] +
            1;

        emit StakeAdded(msg.sender, tokenAddress, amount);
    }

    ////////////////////////////////////
    /////// WITHDRAW n MINT ////////////
    ////////////////////////////////////

    /*
    Withdraw function.
    Mint user any outstanding float before
    */
    function withdraw(address tokenAddress, uint256 amount) external {
        require(
            userAmountStaked[tokenAddress][msg.sender] > 0,
            "nothing to withdraw"
        );
        creditAccumulatedFloat(tokenAddress);

        userAmountStaked[tokenAddress][msg.sender] = userAmountStaked[
            tokenAddress
        ][msg.sender]
            .sub(amount);

        ERC20PresetMinterPauserUpgradeSafe(tokenAddress).transfer(
            msg.sender,
            amount
        );

        mintFloat();
        emit StakeWithdrawn(msg.sender, tokenAddress, amount);
    }

    /*
    Mint function.
    If the user has accumulated float, we mint it to them.
    */
    function mintFloat() public {
        if (accumulatedFloat[msg.sender] > 0) {
            uint256 floatToMint = accumulatedFloat[msg.sender];
            accumulatedFloat[msg.sender] = 0;
            // mint and send user floatToMint
            floatToken.mint(msg.sender, floatToMint);
            emit FloatMinted(msg.sender, floatToMint);
        }
    }
}
