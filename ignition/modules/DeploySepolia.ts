import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import EFTModule from "./EFT.js";
import PricingDAOModule from "./PricingDAO.js";
import AaveVaultSepoliaModule from "./AaveVault.sepolia.js";

// Deploys all contracts on Sepolia testnet
// Uses EURS instead of EURC for AaveVault (EURC not available on Aave Sepolia)
export default buildModule("DeployAllSepolia", (m) => {
  const { token } = m.useModule(EFTModule);
  const { pricingDAO } = m.useModule(PricingDAOModule);
  const { aaveVault } = m.useModule(AaveVaultSepoliaModule);

  return { token, pricingDAO, aaveVault };
});
