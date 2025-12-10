import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseUnits } from "ethers";

export default buildModule("PricingDAOModule", (m) => {
  const admin = m.getParameter("admin", m.getAccount(0));
  const pmo = m.getParameter("pmo", m.getAccount(1));
  const initialPrice = m.getParameter("initialPrice", parseUnits("0.15", 6));
  const maxPrice = m.getParameter("maxPrice", parseUnits("0.25", 6));

  const pricingDAO = m.contract("PricingDAO", [admin, pmo, initialPrice, maxPrice]);

  return { pricingDAO };
});
