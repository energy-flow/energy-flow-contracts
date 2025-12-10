import {expect} from "chai";
import {network} from "hardhat";

const { ethers } = await network.connect();

async function deployMockTokens() {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const eurc = await MockERC20.deploy("Euro Coin", "EURC", ethers.parseUnits("1000000", 6));
    const aEurc = await MockERC20.deploy("Aave Euro Coin", "aEURC", 0);

    return { eurc, aEurc };
}

async function setUpSmartContract() {
    const [admin, pmo, user1, user2] = await ethers.getSigners();

    const { eurc, aEurc } = await deployMockTokens();
    const aavePool = await ethers.deployContract("MockAavePool", [await eurc.getAddress(), await aEurc.getAddress()]);
    const addressesProvider = await ethers.deployContract("MockPoolAddressesProvider", [await aavePool.getAddress()]);

    const vault = await ethers.deployContract("AaveVault", [
        admin.address,
        await addressesProvider.getAddress(),
        await eurc.getAddress(),
        await aEurc.getAddress(),
    ]);

    // Mint des EURC à pmo et transfert au vault
    const amount = ethers.parseUnits("1000", 6);
    await eurc.mint(pmo.address, amount);

    await eurc.transfer(admin.address, amount);
    await eurc.transfer(user1.address, amount);

    return { vault, eurc, aEurc, aavePool, admin, user1, user2 };
}

describe("AaveVault - Deployment", function () {
    it("Should initialize with zero balances", async function () {
        const { vault } = await setUpSmartContract();
        expect(await vault.totalDeposited()).to.equal(0);
        expect(await vault.totalWithdrawn()).to.equal(0);
    });
});

describe("AaveVault - Deposit", function () {
    it("Should deposit EURC into Aave and mint aEURC", async function () {
        const { vault, eurc, aEurc, admin } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        // Transfer EURC to vault first
        await eurc.connect(admin).transfer(await vault.getAddress(), depositAmount);

        // Approve and deposit
        await vault.connect(admin).deposit(admin.address, depositAmount);

        expect(await vault.totalDeposited()).to.equal(depositAmount);
        expect(await aEurc.balanceOf(await vault.getAddress())).to.equal(depositAmount);
    });

    it("Should revert when depositing zero amount", async function () {
        const { vault, admin } = await setUpSmartContract();

        await expect(
            vault.connect(admin).deposit(admin.address, 0)
        ).to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("Should revert when PMO address is zero", async function () {
        const { vault, admin } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await expect(
            vault.connect(admin).deposit(ethers.ZeroAddress, depositAmount)
        ).to.be.revertedWithCustomError(vault, "ZeroAddress");
    });

    it("Should revert when non-owner tries to deposit", async function () {
        const { vault, user1 } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await expect(
            vault.connect(user1).deposit(user1.address, depositAmount)
        ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should track PMO deposits correctly", async function () {
        const { vault, eurc, admin, user1 } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(admin).transfer(await vault.getAddress(), depositAmount);
        await vault.connect(admin).deposit(user1.address, depositAmount);

        const [pmoDeposited] = await vault.connect(admin).getPmoInfo(user1.address);
        expect(pmoDeposited).to.equal(depositAmount);
    });

    it("Should accumulate multiple deposits for same PMO", async function () {
        const { vault, eurc, admin, user1 } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(admin).transfer(await vault.getAddress(), depositAmount * 2n);
        await vault.connect(admin).deposit(user1.address, depositAmount);
        await vault.connect(admin).deposit(user1.address, depositAmount);

        const [pmoDeposited] = await vault.connect(admin).getPmoInfo(user1.address);
        expect(pmoDeposited).to.equal(depositAmount * 2n);
        expect(await vault.totalDeposited()).to.equal(depositAmount * 2n);
    });

    it("Should emit Deposited event", async function () {
        const { vault, eurc, admin } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(admin).transfer(await vault.getAddress(), depositAmount);

        await expect(vault.connect(admin).deposit(admin.address, depositAmount))
            .to.emit(vault, "Deposited")
            .withArgs(depositAmount);
    });
});

describe("AaveVault - Withdraw", function () {
    it("Should withdraw EURC from Aave", async function () {
        const { vault, eurc, aEurc, admin } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        // Setup: deposit first
        await eurc.connect(admin).transfer(await vault.getAddress(), depositAmount);
        await vault.connect(admin).deposit(admin.address, depositAmount);

        const adminBalanceBefore = await eurc.balanceOf(admin.address);

        // Withdraw to admin (PMO)
        await vault.connect(admin).withdraw(admin.address, depositAmount);

        expect(await vault.totalWithdrawn()).to.equal(depositAmount);
        expect(await eurc.balanceOf(admin.address)).to.equal(adminBalanceBefore + depositAmount);
        expect(await aEurc.balanceOf(await vault.getAddress())).to.equal(0);
    });

    it("Should revert when withdrawing zero amount", async function () {
        const { vault, admin } = await setUpSmartContract();

        await expect(
            vault.connect(admin).withdraw(admin.address, 0)
        ).to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("Should revert when PMO address is zero", async function () {
        const { vault, admin } = await setUpSmartContract();
        const withdrawAmount = ethers.parseUnits("100", 6);

        await expect(
            vault.connect(admin).withdraw(ethers.ZeroAddress, withdrawAmount)
        ).to.be.revertedWithCustomError(vault, "ZeroAddress");
    });

    it("Should revert when non-owner tries to withdraw", async function () {
        const { vault, user1 } = await setUpSmartContract();
        const withdrawAmount = ethers.parseUnits("100", 6);

        await expect(
            vault.connect(user1).withdraw(user1.address, withdrawAmount)
        ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should emit Withdrawn event", async function () {
        const { vault, eurc, admin } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(admin).transfer(await vault.getAddress(), depositAmount);
        await vault.connect(admin).deposit(admin.address, depositAmount);

        await expect(vault.connect(admin).withdraw(admin.address, depositAmount))
            .to.emit(vault, "Withdrawn")
            .withArgs(depositAmount);
    });
});

describe("AaveVault - getPmoInfo", function () {
    it("Should return correct PMO info after deposit", async function () {
        const { vault, eurc, admin, user1 } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(admin).transfer(await vault.getAddress(), depositAmount);
        await vault.connect(admin).deposit(user1.address, depositAmount);

        const [pmoDeposited, pmoWithdrawn] = await vault.connect(admin).getPmoInfo(user1.address);
        expect(pmoDeposited).to.equal(depositAmount);
        expect(pmoWithdrawn).to.equal(0);
    });

    it("Should return zero for non-existent PMO", async function () {
        const { vault, admin, user1 } = await setUpSmartContract();

        const [pmoDeposited, pmoWithdrawn] = await vault.connect(admin).getPmoInfo(user1.address);
        expect(pmoDeposited).to.equal(0);
        expect(pmoWithdrawn).to.equal(0);
    });

    it("Should revert when PMO address is zero", async function () {
        const { vault, admin } = await setUpSmartContract();

        await expect(
            vault.connect(admin).getPmoInfo(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(vault, "ZeroAddress");
    });

    it("Should revert when non-owner tries to get PMO info", async function () {
        const { vault, user1 } = await setUpSmartContract();

        await expect(
            vault.connect(user1).getPmoInfo(user1.address)
        ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
});

describe("AaveVault - getAavePosition", function () {
    it("Should return zero when no deposits made", async function () {
        const { vault } = await setUpSmartContract();

        expect(await vault.getAavePosition()).to.equal(0);
    });

    it("Should return correct aEURC balance after deposit", async function () {
        const { vault, eurc, admin } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(admin).transfer(await vault.getAddress(), depositAmount);
        await vault.connect(admin).deposit(admin.address, depositAmount);

        expect(await vault.getAavePosition()).to.equal(depositAmount);
    });

    it("Should return zero after full withdrawal", async function () {
        const { vault, eurc, admin } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(admin).transfer(await vault.getAddress(), depositAmount);
        await vault.connect(admin).deposit(admin.address, depositAmount);
        await vault.connect(admin).withdraw(admin.address, depositAmount);

        expect(await vault.getAavePosition()).to.equal(0);
    });

    it("Should return partial balance after partial withdrawal", async function () {
        const { vault, eurc, admin } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);
        const withdrawAmount = ethers.parseUnits("40", 6);

        await eurc.connect(admin).transfer(await vault.getAddress(), depositAmount);
        await vault.connect(admin).deposit(admin.address, depositAmount);
        await vault.connect(admin).withdraw(admin.address, withdrawAmount);

        expect(await vault.getAavePosition()).to.equal(depositAmount - withdrawAmount);
    });
});