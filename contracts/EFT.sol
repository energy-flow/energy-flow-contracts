// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title EFT - Energy Flow Token
 * @notice Token ERC20 pour la tokenisation de l'énergie
 * @dev Implémente un système de rôles pour sécuriser le minting
 */
contract EFT is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    event EnergyTokenized(address indexed recipient, uint256 amount, string meterId);
    event EnergyBurned(address indexed account, uint256 amount);

    /**
     * @notice Initialise le contrat EFT
     * @param initialAdmin Adresse qui recevra le rôle DEFAULT_ADMIN_ROLE
     */
    constructor(address initialAdmin) ERC20("Energy Flow Token", "EFT") {
        require(initialAdmin != address(0), "EFT : admin is zero address");

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
    }

    /**
     * @notice Crée de nouveaux tokens EFT
     * @dev Fonction réservée aux adresses ayant le rôle MINTER_ROLE
     * @param to Adresse qui recevra les tokens (producteur)
     * @param amount Quantité de tokens à créer (en wei, 18 décimales)
     * @param meterId Identifiant unique du compteur d'énergie (pour traçabilité)
     */
    function mint(address to, uint256 amount, string calldata meterId) external onlyRole(MINTER_ROLE) {
        require(amount > 0, "EFT: mint amount must be positive");
        require(bytes(meterId).length > 0, "EFT: meterId required");

        _mint(to, amount);
        emit EnergyTokenized(to, amount, meterId);
    }

    /**
     * @notice Détruit des tokens d'un compte spécifique
     * @param account Compte dont on détruit les tokens
     * @param amount Quantité de tokens à détruire
     */
    function burnFrom(address account, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(amount > 0, "EFT: burn amount must be positive");

        // TODO: Should check for allowance?
        _burn(account, amount);
        emit EnergyBurned(account, amount);
    }
}