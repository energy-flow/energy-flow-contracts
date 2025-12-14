// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IPool.sol";
import "./interfaces/IPoolAddressesProvider.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AaveVault - EURC yield generation through Aave V3
 * @notice Manages EURC deposits into Aave V3 to generate yield for PMOs
 * @dev Uses a whitelist system for authorized depositors (PMO wallets)
 */
contract AaveVault is Ownable, ReentrancyGuard {
    IERC20 public immutable eurc;
    IERC20 public immutable aEurc;
    IPool public immutable aavePool;

    struct PMOInfo {
        uint totalDeposited;
        uint totalWithdrawn;
    }

    mapping(address => PMOInfo) public pmos;
    mapping(address => bool) public authorizedDepositors;
    uint public totalDeposited;
    uint public totalWithdrawn;

    // ============ Events ============

    event Deposited(address indexed depositor, uint amount);
    event Withdrawn(address indexed depositor, uint amount);
    event DepositorAdded(address indexed depositor);
    event DepositorRemoved(address indexed depositor);
    event InterestsHarvested(uint amount, address indexed safetyBuffer);

    // ============ Errors ============

    error ZeroAmount();
    error ZeroAddress();
    error NotAuthorized();
    error TransferFromFailed();
    error ExceedsWithdrawableAmount();

    /**
     * @notice Initializes the vault manager
     * @param _admin Address that will receive ownership
     * @param _poolAddressesProvider Address of the Aave V3 PoolAddressesProvider (registry contract)
     * @param _eurc Address of the EURC token
     * @param _aEurc Address of the aEURC token (Aave interest-bearing token)
     */
    constructor(address _admin, address _poolAddressesProvider, address _eurc, address _aEurc) Ownable(_admin) {
        require(_admin != address(0), ZeroAddress());
        require(_poolAddressesProvider != address(0), ZeroAddress());
        require(_eurc != address(0), ZeroAddress());
        require(_aEurc != address(0), ZeroAddress());

        // PoolAddressesProvider is Aave's registry contract that stores addresses of all Aave contracts.
        // We use it to get the current Pool address, which allows Aave to upgrade the Pool
        // without breaking integrations (the provider address stays the same).
        address _poolAddress = IPoolAddressesProvider(_poolAddressesProvider).getPool();
        require(_poolAddress != address(0), ZeroAddress());

        aavePool = IPool(_poolAddress);
        eurc = IERC20(_eurc);
        aEurc = IERC20(_aEurc);
    }

    // ============ Whitelist Management ============

    /**
     * @notice Adds an address to the authorized depositors whitelist
     * @param _depositor Address to whitelist
     */
    function addDepositor(address _depositor) external onlyOwner {
        require(_depositor != address(0), ZeroAddress());
        authorizedDepositors[_depositor] = true;
        emit DepositorAdded(_depositor);
    }

    /**
     * @notice Removes an address from the authorized depositors whitelist
     * @param _depositor Address to remove from whitelist
     */
    function removeDepositor(address _depositor) external onlyOwner {
        require(_depositor != address(0), ZeroAddress());
        authorizedDepositors[_depositor] = false;
        emit DepositorRemoved(_depositor);
    }

    // ============ Deposit / Withdraw ============

    /**
     * @notice Deposits EURC into Aave V3 on behalf of the caller (PMO)
     * @dev Caller must have approved this contract to spend their EURC
     * @param _amount Amount of EURC to deposit (6 decimals)
     */
    function deposit(uint _amount) external nonReentrant {
        require(authorizedDepositors[msg.sender], NotAuthorized());
        require(_amount > 0, ZeroAmount());

        bool _success = eurc.transferFrom(msg.sender, address(this), _amount);
        require(_success, TransferFromFailed());

        eurc.approve(address(aavePool), _amount);
        aavePool.supply(address(eurc), _amount, address(this), 0);

        pmos[msg.sender].totalDeposited += _amount;
        totalDeposited += _amount;

        emit Deposited(msg.sender, _amount);
    }

    /**
     * @notice Withdraws EURC from Aave V3 directly to the caller (PMO)
     * @dev Caller can only withdraw up to their deposited amount minus previous withdrawals
     * @param _amount Amount of EURC to withdraw (6 decimals)
     * @return amountWithdrawn Actual amount withdrawn from Aave
     */
    function withdraw(uint _amount) external nonReentrant returns (uint amountWithdrawn) {
        require(authorizedDepositors[msg.sender], NotAuthorized());
        require(_amount > 0, ZeroAmount());

        PMOInfo storage _pmo = pmos[msg.sender];
        require(_amount <= _pmo.totalDeposited - _pmo.totalWithdrawn, ExceedsWithdrawableAmount());

        amountWithdrawn = aavePool.withdraw(address(eurc), _amount, msg.sender);

        _pmo.totalWithdrawn += amountWithdrawn;
        totalWithdrawn += amountWithdrawn;

        emit Withdrawn(msg.sender, amountWithdrawn);
    }

    // ============ Interest Harvesting ============

    /**
     * @notice Harvests accrued interests from Aave and sends them to a safety buffer
     * @dev Only callable by owner (Energy Flow SAS). Interests = aEURC balance - total principal
     * @param _safetyBuffer Address to receive the harvested interests
     * @return interests Amount of interests harvested
     */
    function harvestInterests(address _safetyBuffer) external onlyOwner nonReentrant returns (uint interests) {
        require(_safetyBuffer != address(0), ZeroAddress());
        interests = aEurc.balanceOf(address(this)) - (totalDeposited - totalWithdrawn);
        aavePool.withdraw(address(eurc), interests, _safetyBuffer);

        emit InterestsHarvested(interests, _safetyBuffer);
    }

    // ============ View Functions ============

    /**
     * @notice Returns deposit and withdrawal totals for a PMO
     * @param _pmo Address of the PMO to query
     * @return pmoDeposited Total amount deposited by the PMO
     * @return pmoWithdrawn Total amount withdrawn by the PMO
     */
    function getPmoInfo(address _pmo) external view returns (uint pmoDeposited, uint pmoWithdrawn) {
        PMOInfo memory _info = pmos[_pmo];
        return (_info.totalDeposited, _info.totalWithdrawn);
    }

    /**
     * @notice Returns the current balance in Aave (including accrued interest)
     * @return balance The total balance of aEURC held by this contract
     */
    function getAavePosition() external view returns (uint) {
        return aEurc.balanceOf(address(this));
    }
}
