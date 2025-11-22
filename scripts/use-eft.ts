import { ethers } from "hardhat";

/**
 * Script d'exemple pour utiliser le token EFT (Energy Flow Token)
 *
 * Ce script démontre:
 * 1. Le déploiement du contrat
 * 2. La gestion des rôles
 * 3. Le minting de tokens
 * 4. Les transferts
 * 5. Le burning de tokens
 * 6. La lecture des événements
 */
async function main() {
  console.log("\n=== Démarrage du script EFT ===\n");

  // Récupérer les comptes
  const [admin, minter, producer, consumer] = await ethers.getSigners();

  console.log("Comptes utilisés:");
  console.log("- Admin:", admin.address);
  console.log("- Minter:", minter.address);
  console.log("- Producer:", producer.address);
  console.log("- Consumer:", consumer.address);
  console.log();

  // 1. Déployer le contrat EFT
  console.log("1. Déploiement du contrat EFT...");
  const EFT = await ethers.getContractFactory("EFT");
  const token = await EFT.deploy(admin.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("✓ Token EFT déployé à l'adresse:", tokenAddress);
  console.log();

  // 2. Configuration des rôles
  console.log("2. Configuration des rôles...");
  const EFT_MINTER_ROLE = await token.EFT_MINTER_ROLE();

  // Accorder le rôle de minter
  const grantTx = await token.connect(admin).grantRole(EFT_MINTER_ROLE, minter.address);
  await grantTx.wait();
  console.log("✓ Rôle EFT_MINTER accordé à:", minter.address);

  // Vérifier les rôles
  const hasMinterRole = await token.hasRole(EFT_MINTER_ROLE, minter.address);
  console.log("✓ Vérification: minter a le rôle?", hasMinterRole);
  console.log();

  // 3. Minting de tokens (tokenisation de l'énergie)
  console.log("3. Tokenisation de l'énergie produite...");

  // Le producteur génère 1000 kWh d'énergie solaire
  const energyAmount = ethers.parseEther("1000"); // 1000 EFT = 1000 kWh
  const meterId = "SOLAR_METER_001";

  const mintTx = await token.connect(minter).mint(producer.address, energyAmount, meterId);
  const mintReceipt = await mintTx.wait();
  console.log("✓ Tokens mintés:", ethers.formatEther(energyAmount), "EFT");
  console.log("  Pour:", producer.address);
  console.log("  Compteur:", meterId);

  // Afficher l'événement EnergyTokenized
  const tokenizedEvent = mintReceipt?.logs.find(
    (log: any) => log.fragment?.name === "EnergyTokenized"
  );
  if (tokenizedEvent) {
    console.log("✓ Événement EnergyTokenized émis");
  }

  // Vérifier le solde
  const producerBalance = await token.balanceOf(producer.address);
  console.log("✓ Solde du producteur:", ethers.formatEther(producerBalance), "EFT");
  console.log();

  // 4. Transfert de tokens (vente d'énergie)
  console.log("4. Transfert de tokens (vente d'énergie)...");

  const transferAmount = ethers.parseEther("300"); // Le consommateur achète 300 kWh
  const transferTx = await token.connect(producer).transfer(consumer.address, transferAmount);
  await transferTx.wait();

  console.log("✓ Transfert de", ethers.formatEther(transferAmount), "EFT");
  console.log("  De:", producer.address);
  console.log("  Vers:", consumer.address);

  const producerBalanceAfterTransfer = await token.balanceOf(producer.address);
  const consumerBalance = await token.balanceOf(consumer.address);

  console.log("✓ Nouveau solde producteur:", ethers.formatEther(producerBalanceAfterTransfer), "EFT");
  console.log("✓ Solde consommateur:", ethers.formatEther(consumerBalance), "EFT");
  console.log();

  // 5. Burning de tokens (consommation d'énergie)
  console.log("5. Burning de tokens (consommation d'énergie)...");

  const burnAmount = ethers.parseEther("100"); // Le consommateur utilise 100 kWh
  const burnReason = "consommation_electrique";

  const burnTx = await token.connect(consumer).burn(burnAmount, burnReason);
  const burnReceipt = await burnTx.wait();

  console.log("✓ Tokens brûlés:", ethers.formatEther(burnAmount), "EFT");
  console.log("  Raison:", burnReason);

  const consumerBalanceAfterBurn = await token.balanceOf(consumer.address);
  const totalSupply = await token.totalSupply();

  console.log("✓ Nouveau solde consommateur:", ethers.formatEther(consumerBalanceAfterBurn), "EFT");
  console.log("✓ Supply totale:", ethers.formatEther(totalSupply), "EFT");
  console.log();

  // 6. Lecture des événements (audit et traçabilité)
  console.log("6. Audit des événements...");

  // Récupérer tous les événements EnergyTokenized
  const tokenizedEvents = await token.queryFilter(
    token.filters.EnergyTokenized(),
    0,
    "latest"
  );

  console.log("✓ Événements de tokenisation:", tokenizedEvents.length);
  for (const event of tokenizedEvents) {
    console.log("  -", ethers.formatEther(event.args.amount), "EFT pour", event.args.meterId);
  }

  // Récupérer tous les événements EnergyBurned
  const burnedEvents = await token.queryFilter(
    token.filters.EnergyBurned(),
    0,
    "latest"
  );

  console.log("✓ Événements de burning:", burnedEvents.length);
  for (const event of burnedEvents) {
    console.log("  -", ethers.formatEther(event.args.amount), "EFT pour", event.args.reason);
  }
  console.log();

  // 7. Vérification anti-double comptage
  console.log("7. Vérification anti-double comptage...");

  const allBalances =
    (await token.balanceOf(admin.address)) +
    (await token.balanceOf(minter.address)) +
    (await token.balanceOf(producer.address)) +
    (await token.balanceOf(consumer.address));

  console.log("✓ Somme de tous les soldes:", ethers.formatEther(allBalances), "EFT");
  console.log("✓ Supply totale:", ethers.formatEther(totalSupply), "EFT");
  console.log("✓ Égalité vérifiée:", allBalances === totalSupply ? "OUI ✓" : "NON ✗");
  console.log();

  // Résumé final
  console.log("=== Résumé ===");
  console.log("Contrat EFT:", tokenAddress);
  console.log("Supply totale:", ethers.formatEther(totalSupply), "EFT");
  console.log("Solde producteur:", ethers.formatEther(await token.balanceOf(producer.address)), "EFT");
  console.log("Solde consommateur:", ethers.formatEther(await token.balanceOf(consumer.address)), "EFT");
  console.log("\n=== Script terminé avec succès ===\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });