import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseUnits } from "ethers";

const INITIAL_EURC_SUPPLY = parseUnits("1000", 6); // 1000 EURC

export default buildModule("AaveVaultLocalModule", (m) => {
  const deployer = m.getAccount(0);
  const pmoAccount = m.getAccount(0); // Simulated PMO wallet

  const eurc = m.contract("MockERC20", ["Euro Coin", "EURC", 0], { id: "MockEURC" });
  const aEurc = m.contract("MockERC20", ["Aave EURC", "aEURC", 0], { id: "MockAEURC" });
  const mockPool = m.contract("MockAavePool", [eurc, aEurc]);
  const mockProvider = m.contract("MockPoolAddressesProvider", [mockPool]);

  const aaveVault = m.contract("AaveVault", [deployer, mockProvider, eurc, aEurc]);

  // Mint EURC to the deployer (admin) for demo
  m.call(eurc, "mint", [deployer, INITIAL_EURC_SUPPLY], { id: "mintEurcToAdmin" });

  // Mint EURC to the PMO wallet
  m.call(eurc, "mint", [pmoAccount, INITIAL_EURC_SUPPLY], { id: "mintEurcToPmo" });

  // Whitelist the admin as authorized depositor (for demo)
  m.call(aaveVault, "addDepositor", [deployer], { id: "whitelistAdmin" });

  // Whitelist the PMO as authorized depositor
  m.call(aaveVault, "addDepositor", [pmoAccount], { id: "whitelistPmo" });

  return { eurc, aEurc, mockPool, mockProvider, aaveVault };
});
