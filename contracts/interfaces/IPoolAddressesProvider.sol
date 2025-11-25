// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title IPoolAddressesProvider
 * @dev Interface minimale du PoolAddressesProvider Aave v3
 *
 * Ce contrat est le "registre" officiel qui retourne l'adresse
 * du Pool actif pour un réseau donné.
 */
interface IPoolAddressesProvider {
    /**
     * @notice Retourne l'adresse actuelle du Pool Aave v3.
     */
    function getPool() external view returns (address);
}