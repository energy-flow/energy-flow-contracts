import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseUnits } from "ethers";

const INITIAL_EURC_SUPPLY = parseUnits("1000", 6); // 1000 EURC

export default buildModule("AaveVaultLocalModule", (m) => {
  const deployer = m.getAccount(0);
  const eurc = m.contract("MockERC20", ["Euro Coin", "EURC", 0], { id: "MockEURC" });
  const aEurc = m.contract("MockERC20", ["Aave EURC", "aEURC", 0], { id: "MockAEURC" });
  const mockPool = m.contract("MockAavePool", [eurc, aEurc]);
  const mockProvider = m.contract("MockPoolAddressesProvider", [mockPool]);

  const aaveVault = m.contract("AaveVault", [deployer, mockProvider, eurc, aEurc]);

  // Mint EURC to the vault so it can deposit to Aave
  m.call(eurc, "mint", [aaveVault, INITIAL_EURC_SUPPLY], { id: "mintEurcToVault" });

  return { eurc, aEurc, mockPool, mockProvider, aaveVault };
});
