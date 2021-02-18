pragma solidity 0.7.6;

/*
 * Manages yield accumulation for the LongShort contract. Each market is
 * deployed with its own yield manager to simplify the bookkeeping, as
 * different markets may share an underlying fund token.
 */
abstract contract IYieldManager {
    /*
     * Deposits the given amount of tokens into this yield manager.
     */
    function depositToken(uint256 amount) public virtual;

    /*
     * Withdraws the given amount of tokens from this yield manager.
     *
     * TODO(guy): at some point we should support withdrawing the
     *   underlying yield tokens if the protocol we use doesn't have
     *   enough liquidity.
     */
    function withdrawToken(uint256 amount) public virtual;

    /*
     * Returns the total token value held by this yield manager.
     */
    function getTotalHeld() public virtual returns (uint256 amount);

    /*
     * Returns the token held by this yield manager.
     */
    function getHeldToken() public view virtual returns (address token);
}
