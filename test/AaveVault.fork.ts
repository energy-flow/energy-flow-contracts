import { expect } from "chai";
import { network } from "hardhat";
import { AaveV3Ethereum } from "@bgd-labs/aave-address-book";

const { ethers } = await network.connect();

const POOL_ADDRESSES_PROVIDER = AaveV3Ethereum.POOL_ADDRESSES_PROVIDER;
const EURC_ADDRESS = AaveV3Ethereum.ASSETS.EURC.UNDERLYING;
const AEURC_ADDRESS = AaveV3Ethereum.ASSETS.EURC.A_TOKEN;

// ABI minimal pour ERC20
const ERC20_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
];

// Whale EURC (Circle Treasury) pour obtenir des tokens de test
// On "impersonne" cette adresse pour transférer des EURC
const EURC_WHALE = "0x55FE002aefF02F77364de339a1292923A15844B8";

async function setUpForkTest() {
    const [admin, pmo, recipient] = await ethers.getSigners();

    // Contracts sur le mainnet forké (ABI inline)
    const eurc = new ethers.Contract(EURC_ADDRESS, ERC20_ABI, ethers.provider) as any;
    const aEurc = new ethers.Contract(AEURC_ADDRESS, ERC20_ABI, ethers.provider) as any;

    const vault = await ethers.deployContract("AaveVault", [
        admin.address,
        POOL_ADDRESSES_PROVIDER,
        EURC_ADDRESS,
        AEURC_ADDRESS,
    ]);

    // Impersonner le whale EURC pour obtenir des tokens de test
    // dit au noeud hardhat d'autoriser les transactions signees par adresse whale sans cle privee
    await ethers.provider.send("hardhat_impersonateAccount", [EURC_WHALE]);

    const whale = await ethers.getSigner(EURC_WHALE);

    // Envoyer de l'ETH au whale pour payer le gas (simulation)
    await admin.sendTransaction({
        to: EURC_WHALE,
        value: ethers.parseEther("1"),
    });

    // Transférer des EURC du whale vers le vault (simulation locale)
    const transferAmount = ethers.parseUnits("1000", 6); // 1000 EURC
    await eurc.connect(whale).transfer(await vault.getAddress(), transferAmount);

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [EURC_WHALE]);

    return { vault, eurc, aEurc, admin, pmo, recipient };
}

describe("AaveVault Fork - Integration Tests", function () {
    // temps max du test (60 sec)
    this.timeout(60000);

    it("Should deposit EURC into real Aave Pool", async function () {
        const { vault, aEurc, admin, pmo } = await setUpForkTest();
        const depositAmount = ethers.parseUnits("100", 6); // 100 EURC

        const vaultAddress = await vault.getAddress();
        const aEurcBalanceBefore = await aEurc.balanceOf(vaultAddress);

        // Deposit via le vault
        await vault.connect(admin).deposit(pmo.address, depositAmount);

        // Vérifier que le vault a reçu des aEURC
        const aEurcBalanceAfter = await aEurc.balanceOf(vaultAddress);
        expect(aEurcBalanceAfter).to.be.greaterThan(aEurcBalanceBefore);

        // Vérifier le tracking interne
        expect(await vault.totalDeposited()).to.equal(depositAmount);
    });

    it("Should withdraw EURC from real Aave Pool", async function () {
        // TODO: mettre les noms de variables plus explicites
        const { vault, eurc, admin, pmo, recipient } = await setUpForkTest();
        const depositAmount = ethers.parseUnits("100", 6);
        const withdrawAmount = ethers.parseUnits("50", 6);

        // Deposit
        await vault.connect(admin).deposit(pmo.address, depositAmount);

        const recipientBalanceBefore = await eurc.balanceOf(recipient.address);

        // Withdraw from pool to recepient
        await vault.connect(admin).withdraw(pmo.address, withdrawAmount, recipient.address);

        // Vérifier que le recipient a reçu les EURC
        const recipientBalanceAfter = await eurc.balanceOf(recipient.address);
        expect(recipientBalanceAfter).to.equal(recipientBalanceBefore + withdrawAmount);

        // Vérifier le tracking interne
        expect(await vault.totalWithdrawn()).to.equal(withdrawAmount);
    });

    it("Should report correct Aave position", async function () {
        const { vault, admin, pmo } = await setUpForkTest();
        const depositAmount = ethers.parseUnits("500", 6);

        // Position initiale = 0
        expect(await vault.getAavePosition()).to.equal(0);

        // Après deposit
        await vault.connect(admin).deposit(pmo.address, depositAmount);

        // La position devrait être >= depositAmount (peut être légèrement plus avec les intérêts)
        const position = await vault.getAavePosition();
        expect(position).to.be.greaterThanOrEqual(depositAmount);
    });

    it("Should handle multiple deposits and withdrawals", async function () {
        const { vault, eurc, admin, pmo, recipient } = await setUpForkTest();

        // Plusieurs deposits
        await vault.connect(admin).deposit(pmo.address, ethers.parseUnits("100", 6));
        await vault.connect(admin).deposit(pmo.address, ethers.parseUnits("200", 6));
        await vault.connect(admin).deposit(pmo.address, ethers.parseUnits("150", 6));

        expect(await vault.totalDeposited()).to.equal(ethers.parseUnits("450", 6));

        // Withdrawal partiel
        await vault.connect(admin).withdraw(pmo.address, ethers.parseUnits("300", 6), recipient.address);

        expect(await vault.totalWithdrawn()).to.equal(ethers.parseUnits("300", 6));

        // Position restante
        const position = await vault.getAavePosition();
        expect(position).to.be.greaterThanOrEqual(ethers.parseUnits("150", 6));
    });
});
