//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

import "hardhat/console.sol";
import "../interfaces/IADai.sol";
import "./MockERC20.sol";

// import '@openzeppelin/contracts-upgradeable/token/ERC20/ERC20.sol';

//import 'hardhat/console.sol';

// MOCK ONLY
contract ADai is MockERC20 {
    MockERC20 public dai;
    bool public noLiquidityBool;

    constructor(MockERC20 daiAddress)
        public
        MockERC20("Dai", "D", 18, msg.sender)
    {
        dai = daiAddress;
        noLiquidityBool = false;
    }

    function setRedeemFailNotEnoughLiquidity(bool liquidityStatus) public {
        noLiquidityBool = liquidityStatus;
    }

    function redeem(uint256 _amount) public {
        // THIS FUNCTION IS FAILING
        // Assuming its on dai.mint, where this contract doesn't have mint permission token
        // But.. I have given it permission. Anyways, assuming aDai is returned instead of dai....
        require(!noLiquidityBool, "Not enough liquidity in Pool (MOCK)");
        //console.log(" **** aDai being redeemed by *****", msg.sender);
        //console.log("Burning this amount of aDai: ", _amount);
        this.burnFrom(msg.sender, _amount);
        //console.log("Sending this amount of dai: ", _amount);
        dai.mint(msg.sender, _amount);
        // console.log(" **** aDai redemtpion successful *****");
    }
}
