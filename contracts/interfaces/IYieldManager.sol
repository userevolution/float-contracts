pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/presets/ERC20PresetMinterPauser.sol";

abstract contract IYieldManager {
    function depositToken(address erc20Token, uint256 amount) public virtual;

    // Note, it is possible that this won't be able to withdraw the underlying token - so it may have to give the user the interest bearing token
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
