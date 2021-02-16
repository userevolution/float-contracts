pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/presets/ERC20PresetMinterPauserUpgradeable.sol";

abstract contract IYieldManager {
    function depositToken(address erc20Token, uint256 amount) public virtual;

    function withdrawDepositToken(address erc20Token, uint256 amount)
        public
        virtual
        returns (address tokenWithdrawn, uint256 amountWithdrawn);

    function getTotalHeld(address erc20Token)
        public
        view
        virtual
        returns (uint256 amount);
}
