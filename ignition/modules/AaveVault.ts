import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { AaveV3Ethereum } from "@bgd-labs/aave-address-book";

export default buildModule("AaveVaultModule", (m) => {
  const deployer = m.getAccount(0);

  const poolAddressesProvider = m.getParameter(
    "poolAddressesProvider",
    AaveV3Ethereum.POOL_ADDRESSES_PROVIDER
  );
  const eurc = m.getParameter("eurc", AaveV3Ethereum.ASSETS.EURC.UNDERLYING);
  const aEurc = m.getParameter("aEurc", AaveV3Ethereum.ASSETS.EURC.A_TOKEN);

  const aaveVault = m.contract("AaveVault", [
    deployer,
    poolAddressesProvider,
    eurc,
    aEurc,
  ]);

  return { aaveVault };
});
