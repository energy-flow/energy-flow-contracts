# Energy Flow Contracts

Smart contracts Solidity pour la plateforme d'autoconsommation collective Energy Flow.

## Concept

- **1 EFT = 1 kWh** de droits d'énergie locale
- Gouvernance DAO bi-collège (producteurs/consommateurs)
- Intégration DeFi avec Aave V3

## Contrats

| Contrat | Description |
|---------|-------------|
| `EFT.sol` | Token ERC20 représentant les kWh produits (mint/burn avec meterId) |
| `PricingDAO.sol` | Gouvernance du prix kWh avec vote bi-collège (50%/50%) |
| `AaveVault.sol` | Vault DeFi pour dépôts EURC vers Aave V3 |

## Stack technique

- Solidity 0.8.28
- Hardhat 3.x avec EDR
- OpenZeppelin Contracts 5.4.0
- Hardhat Ignition (déploiement)

## Installation

```bash
npm install
```

## Commandes

```bash
# Tests
npx hardhat test                    # Tests unitaires
npx hardhat test --coverage         # Avec couverture
npx hardhat test test/AaveVault.fork.ts --network mainnetFork  # Tests fork

# Déploiement
npx hardhat ignition deploy ignition/modules/DeployLocal.ts              # Local
npx hardhat ignition deploy ignition/modules/DeploySepolia.ts --network sepolia  # Sepolia
```

## Configuration

Définir les variables via Hardhat Keystore :

```bash
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set MAINNET_RPC_URL      # Pour tests fork
```

## Adresses déployées (Sepolia)

| Contrat | Adresse |
|---------|---------|
| PricingDAO | `0x5325677B41090e00067807465B927B5cB13580Ce` |
| EFT | `0xBEeb8a8b5a3F1C206b47907432c82Ecec9d99A84` |
| AaveVault | `0x41c131B337c57bf08eBeb384bc498E40E3351A79` |

## Tests

~100 tests couvrant :
- EFT : mint/burn, rôles, transferts, événements
- PricingDAO : workflow 6 étapes, membres, propositions, votes bi-collège
- AaveVault : dépôt/retrait, whitelist, tracking PMO (mocks + fork mainnet)

## Licence

MIT
