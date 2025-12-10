import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import EFTModule from "./EFT.js";
import PricingDAOModule from "./PricingDAO.js";
import AaveVaultModule from "./AaveVault.js";

export default buildModule("DeployAllMainnet", (m) => {
  const { token } = m.useModule(EFTModule);
  const { pricingDAO } = m.useModule(PricingDAOModule);
  const { aaveVault } = m.useModule(AaveVaultModule);

  return { token, pricingDAO, aaveVault };
});
