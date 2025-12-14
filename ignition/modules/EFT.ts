import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("EFTModule", (m) => {
  // Récupérer le compte qui déploie (sera l'admin par défaut)
  const deployer = m.getAccount(0);

  // Déployer le token avec le deployer comme admin initial
  const token = m.contract("EFT", [deployer]);

  // Définir le rôle de minter (calculé de la même manière que dans le contrat)
  const MINTER_ROLE = m.staticCall(token, "MINTER_ROLE", []);

  // Optionnel: Accorder le rôle de minter au deployer
  // Vous pouvez modifier cette adresse selon vos besoins
  m.call(token, "grantRole", [MINTER_ROLE, deployer], {
    id: "grant_minter_role_to_deployer",
  });

  return { token };
});
