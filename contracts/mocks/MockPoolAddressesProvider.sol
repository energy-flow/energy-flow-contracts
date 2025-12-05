// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPoolAddressesProvider.sol";

contract MockPoolAddressesProvider is IPoolAddressesProvider {
    address private _pool;

    constructor(address pool_) {
        _pool = pool_;
    }

    function getPool() external view override returns (address) {
        return _pool;
    }
}