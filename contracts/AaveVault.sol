// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IPool.sol";
import "./interfaces/IPoolAddressesProvider.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract AaveVault is Ownable, ReentrancyGuard {
    IERC20 public immutable eurc;
    IERC20 public immutable aEurc;
    IPool public immutable aavePool;
    IPoolAddressesProvider public immutable addressesProvider;

    struct PMOInfo {
        bool exists;
        uint totalDeposited;
        uint totalWithdrawn;
    }

    mapping(address => PMOInfo) public pmos;
    uint public totalDeposited;
    uint public totalWithdrawn;

    event Deposited(uint amount);
    event Withdrawn(uint amount);

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientBalance();

    /**
     * @notice Initializes the vault manager
     * @param _admin Address that will receive DEFAULT_ADMIN_ROLE
     * @param _eurc Address of the EURC token
     * @param _aavePool Address of the Aave V3 Pool
     */
    constructor(address _admin, address _aavePool, address _eurc, address _aEurc) Ownable(_admin) {
        require(_admin != address(0), ZeroAddress());
        require(_eurc != address(0), ZeroAddress());
        require(_aavePool != address(0), ZeroAddress());
        require(_aEurc != address(0), ZeroAddress());

        addressesProvider = IPoolAddressesProvider(_aavePool);

        // Récupère l'adresse du Pool actuel via le provider
        address poolAddress = addressesProvider.getPool();
        require(poolAddress != address(0), ZeroAddress());

        aavePool = IPool(poolAddress);
        eurc = IERC20(_eurc);
        aEurc = IERC20(_aEurc);
    }

    function deposit(address _pmo, uint _amount) external onlyOwner nonReentrant {
        require(_amount > 0, ZeroAmount());
        require(_pmo != address(0), ZeroAddress());

        // Autorise le Pool Aave à transférer nos EURC
        eurc.approve(address(aavePool), _amount);

        // Dépose les EURC dans la pool Aave
        aavePool.supply(address(eurc), _amount, address(this), 0);

        if (!pmos[_pmo].exists) {
            pmos[_pmo].exists = true;
        }
        pmos[_pmo].totalDeposited += _amount;
        totalDeposited += _amount;

        emit Deposited(_amount);
    }

    function withdraw(address _pmo, uint _amount) external onlyOwner nonReentrant
        returns (uint amountWithdrawn)
    {
        require(_amount > 0, ZeroAmount());
        require(_pmo != address(0), ZeroAddress());

        amountWithdrawn = aavePool.withdraw(address(eurc), _amount, _pmo);

        pmos[_pmo].totalWithdrawn += _amount;
        totalWithdrawn += _amount;

        emit Withdrawn(_amount);
    }

    function getPmoInfo(address _pmo) external view onlyOwner returns (
        uint pmoDeposited,
        uint pmoWithdrawn
    ) {
        require(_pmo != address(0), ZeroAddress());

        PMOInfo memory info = pmos[_pmo];
        pmoDeposited = info.totalDeposited;
        pmoWithdrawn = info.totalWithdrawn;

        return (pmoDeposited, pmoWithdrawn);
    }

    /**
     * @notice Returns the current balance in Aave (including accrued interest)
     * @return balance The total balance of aEURC held by this contract
     */
    function getAavePosition() external view returns (uint) {
        return aEurc.balanceOf(address(this));
    }
}