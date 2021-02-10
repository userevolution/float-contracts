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

    // mapping(uint256 => )

    // struct{
    //     t =
    //     r =
    //     imbalnce, tokenprice
    // }

    // function calculateRValue(token price, imbalance, time, market){
    //     return r;
    // }

    // function updateSystemTimestampState(token price, imbalance, time, market) extneral onlyCllableByLongShortContract{
    //     calculateRValue()

    //     write to state.
    // }

    ///////// LongShort Contract ///////////
    LongShort public longShortContract;

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

    ////////////////////////////////////
    ///// CONTRACT SET-UP //////////////
    ////////////////////////////////////

    function initialize(address _admin, address _longShortContract)
        public
        initializer
    {
        admin = _admin;
        longShortContract = LongShort(_longShortContract);

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

    function addNewStakingFund(address tokenAddress, uint256 marketIndex)
        external
        onlyAdmin
    {
        // Implement adding the new synthetic here.
    }

    ////////////////////////////////////
    /////////// HELPER FUNCTIONS ///////
    ////////////////////////////////////

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
