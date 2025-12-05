// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./MockERC20.sol";
import "../interfaces/IPool.sol";

/**
 * @title MockAavePool
 * @notice Mock Aave Pool for testing purposes
 * @dev Simulates Aave V3 Pool behavior for supply and withdraw operations
 */
contract MockAavePool is IPool {
    MockERC20 public eurc;
    MockERC20 public aEurc;

    constructor(address _eurc, address _aEurc) {
        eurc = MockERC20(_eurc);
        aEurc = MockERC20(_aEurc);
    }

    /**
     * @notice Simulates Aave supply operation
     * @param _asset The underlying asset to supply
     * @param _amount The amount to supply
     * @param _onBehalfOf The address receiving aTokens
     * _referralCode Referral code unused in mock)
     */
    function supply(
        address _asset,
        uint _amount,
        address _onBehalfOf,
        uint16 /*_referralCode*/
    ) external {
        require(_asset == address(eurc), "MockAavePool: invalid asset");

        // Prend les EURC depuis le Vault
        bool ok = eurc.transferFrom(msg.sender, address(this), _amount);
        require(ok, "TransferFrom failed");

        // Mint des aEURC à onBehalfOf (le Vault)
        aEurc.mint(_onBehalfOf, _amount);
    }

    /**
     * @notice Simulates Aave withdraw operation
     * @param _asset The underlying asset to withdraw
     * @param _amount The amount to withdraw
     * @param _to The address receiving the underlying asset
     * @return The actual amount withdrawn
     */
    function withdraw(
        address _asset,
        uint _amount,
        address _to
    ) external returns (uint) {
        require(_asset == address(eurc), "MockAavePool: invalid asset");

        uint aTokenBalance = aEurc.balanceOf(msg.sender);
        uint amountToWithdraw = _amount;

        if (_amount == type(uint).max) {
            amountToWithdraw = aTokenBalance;
        }

        require(aTokenBalance >= amountToWithdraw, "MockAavePool: insufficient aToken balance");

        aEurc.burn(msg.sender, amountToWithdraw);

        bool ok = eurc.transfer(_to, amountToWithdraw);
        require(ok, "Transfer failed");

        return amountToWithdraw;
    }
}
