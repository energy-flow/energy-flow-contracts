import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseUnits } from "ethers";

export default buildModule("PricingDAOModule", (m) => {
  // TODO: ajouter adresse
  const pmoAdmin = m.getParameter("pmoAdmin", m.getAccount(0));

  // 0.15 EUR/kWh
  const initialPrice = m.getParameter("initialPrice", parseUnits("0.15", 18));

  const pricingDAO = m.contract("PricingDAO", [pmoAdmin, initialPrice]);

  return { pricingDAO };
});
