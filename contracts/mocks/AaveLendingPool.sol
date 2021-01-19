pragma solidity ^0.6.0;

import "../interfaces/IAaveLendingPool.sol";
import "./MockERC20.sol";
// import '@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol';
import "@nomiclabs/buidler/console.sol";

contract AaveLendingPool is IAaveLendingPool {
    using SafeMath for uint256;

    MockERC20 public aDai;
    MockERC20 public dai;
    uint256 public simulatedInstantAPY;

    constructor(
        MockERC20 aDaiAddress,
        MockERC20 daiAddress,
        uint256 _simulatedInstantAPY // 1 to 100 as percentage
    ) public {
        aDai = aDaiAddress;
        dai = daiAddress;
        simulatedInstantAPY = _simulatedInstantAPY;
    }

    function setSimulatedInstantAPY(uint256 _simulatedInstantAPY) public {
        simulatedInstantAPY = _simulatedInstantAPY;
    }

    function deposit(
        address _reserve,
        uint256 _amount,
        uint16 _referralCode
    ) public override {
        dai.burnFrom(msg.sender, _amount);
        uint256 amount = _amount.add(_amount.mul(simulatedInstantAPY).div(100));

        aDai.mint(msg.sender, amount);
        //aDai.mint(msg.sender, _amount);
    }

    function mockSendInterest(address _address, uint256 _amount) public {
        aDai.mint(_address, _amount);
    }
}
