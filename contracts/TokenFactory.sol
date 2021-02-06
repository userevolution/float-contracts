pragma solidity 0.6.12;

import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

import "./LongCoins.sol";

contract TokenFactory is Initializable {
    ////////////////////////////////////
    /////////////// STATE //////////////
    ////////////////////////////////////

    address public admin;
    address public floatContract;

    bytes32 public constant DEFAULT_ADMIN_ROLE =
        keccak256("DEFAULT_ADMIN_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    ////////////////////////////////////
    /////////// MODIFIERS //////////////
    ////////////////////////////////////

    modifier adminOnly() {
        require(msg.sender == admin);
        _;
    }

    modifier onlyFLOAT() {
        require(msg.sender == floatContract);
        _;
    }

    ////////////////////////////////////
    //////////// SET-UP ////////////////
    ////////////////////////////////////

    function setup(address _floatContract) public initializer {
        floatContract = _floatContract;
    }

    ////////////////////////////////////
    //////////// UTILS /////////////////
    ////////////////////////////////////

    function changeFloatAddress(address _floatContract) external adminOnly {
        floatContract = _floatContract;
    }

    ////////////////////////////////////
    ///////// TOKEN CREATION ///////////
    ////////////////////////////////////

    function createTokenLong(
        string calldata syntheticName,
        string calldata syntheticSymbol
    ) external onlyFLOAT returns (LongCoins) {
        LongCoins tokenContract;
        tokenContract = new LongCoins();
        tokenContract.initialize(
            string(abi.encodePacked("LONG", syntheticName)),
            string(abi.encodePacked("L", syntheticSymbol))
        );

        // Give minter roles
        tokenContract.grantRole(DEFAULT_ADMIN_ROLE, floatContract);
        tokenContract.grantRole(MINTER_ROLE, floatContract);
        tokenContract.grantRole(PAUSER_ROLE, floatContract);

        // Revoke roles
        tokenContract.revokeRole(DEFAULT_ADMIN_ROLE, address(this));
        tokenContract.revokeRole(MINTER_ROLE, address(this));
        tokenContract.revokeRole(PAUSER_ROLE, address(this));

        return tokenContract;
    }

    function createTokenShort(
        string calldata syntheticName,
        string calldata syntheticSymbol
    ) external onlyFLOAT returns (LongCoins) {
        LongCoins tokenContract;
        tokenContract = new LongCoins();
        tokenContract.initialize(
            string(abi.encodePacked("SHORT", syntheticName)),
            string(abi.encodePacked("S", syntheticSymbol))
        );

        // Give minter roles
        tokenContract.grantRole(DEFAULT_ADMIN_ROLE, floatContract);
        tokenContract.grantRole(MINTER_ROLE, floatContract);
        tokenContract.grantRole(PAUSER_ROLE, floatContract);

        // Revoke roles
        tokenContract.revokeRole(DEFAULT_ADMIN_ROLE, address(this));
        tokenContract.revokeRole(MINTER_ROLE, address(this));
        tokenContract.revokeRole(PAUSER_ROLE, address(this));

        return tokenContract;
    }
}
