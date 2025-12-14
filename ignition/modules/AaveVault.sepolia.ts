import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { AaveV3Sepolia } from "@bgd-labs/aave-address-book";

// Module for Sepolia deployment using EURS (Euro Stablecoin) instead of EURC
// EURC is not available on Aave Sepolia, EURS is the closest alternative
export default buildModule("AaveVaultSepoliaModule", (m) => {
  const deployer = m.getAccount(0);

  const poolAddressesProvider = m.getParameter(
    "poolAddressesProvider",
    AaveV3Sepolia.POOL_ADDRESSES_PROVIDER
  );
  const stablecoin = m.getParameter("stablecoin", AaveV3Sepolia.ASSETS.EURS.UNDERLYING);
  const aStablecoin = m.getParameter("aStablecoin", AaveV3Sepolia.ASSETS.EURS.A_TOKEN);

  const aaveVault = m.contract("AaveVault", [
    deployer,
    poolAddressesProvider,
    stablecoin,
    aStablecoin,
  ]);

  // Whitelist the deployer (admin) as authorized depositor
  m.call(aaveVault, "addDepositor", [deployer], { id: "whitelistAdmin" });

  return { aaveVault };
});
