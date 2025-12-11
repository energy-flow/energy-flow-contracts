import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseUnits } from "ethers";

export default buildModule("PricingDAOModule", (m) => {
  const pmo = m.getParameter("pmo", m.getAccount(0));
  const initialPrice = m.getParameter("initialPrice", parseUnits("0.15", 6));

  const pricingDAO = m.contract("PricingDAO", [pmo, initialPrice]);

  return { pricingDAO };
});
