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

    // Mint EURC to PMO and user1 for testing
    const amount = ethers.parseUnits("1000", 6);
    await eurc.mint(pmo.address, amount);
    await eurc.mint(user1.address, amount);

    // Whitelist admin and pmo as authorized depositors
    await vault.connect(admin).addDepositor(admin.address);
    await vault.connect(admin).addDepositor(pmo.address);

    return { vault, eurc, aEurc, aavePool, admin, pmo, user1, user2 };
}

describe("AaveVault - Deployment", function () {
    it("Should initialize with zero balances", async function () {
        const { vault } = await setUpSmartContract();
        expect(await vault.totalDeposited()).to.equal(0);
        expect(await vault.totalWithdrawn()).to.equal(0);
    });

    it("Should set correct owner", async function () {
        const { vault, admin } = await setUpSmartContract();
        expect(await vault.owner()).to.equal(admin.address);
    });
});

describe("AaveVault - Whitelist Management", function () {
    it("Should add depositor correctly", async function () {
        const { vault, admin, user1 } = await setUpSmartContract();

        await vault.connect(admin).addDepositor(user1.address);

        expect(await vault.authorizedDepositors(user1.address)).to.be.true;
    });

    it("Should emit DepositorAdded event", async function () {
        const { vault, admin, user2 } = await setUpSmartContract();

        await expect(vault.connect(admin).addDepositor(user2.address))
            .to.emit(vault, "DepositorAdded")
            .withArgs(user2.address);
    });

    it("Should remove depositor correctly", async function () {
        const { vault, admin, pmo } = await setUpSmartContract();

        await vault.connect(admin).removeDepositor(pmo.address);

        expect(await vault.authorizedDepositors(pmo.address)).to.be.false;
    });

    it("Should emit DepositorRemoved event", async function () {
        const { vault, admin, pmo } = await setUpSmartContract();

        await expect(vault.connect(admin).removeDepositor(pmo.address))
            .to.emit(vault, "DepositorRemoved")
            .withArgs(pmo.address);
    });

    it("Should revert when non-owner tries to add depositor", async function () {
        const { vault, user1, user2 } = await setUpSmartContract();

        await expect(
            vault.connect(user1).addDepositor(user2.address)
        ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should revert when non-owner tries to remove depositor", async function () {
        const { vault, pmo, user1 } = await setUpSmartContract();

        await expect(
            vault.connect(user1).removeDepositor(pmo.address)
        ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("Should revert when adding zero address", async function () {
        const { vault, admin } = await setUpSmartContract();

        await expect(
            vault.connect(admin).addDepositor(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(vault, "ZeroAddress");
    });
});

describe("AaveVault - Deposit", function () {
    it("Should deposit EURC into Aave and mint aEURC", async function () {
        const { vault, eurc, aEurc, pmo } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        // PMO approves vault to spend EURC
        await eurc.connect(pmo).approve(await vault.getAddress(), depositAmount);

        // PMO deposits
        await vault.connect(pmo).deposit(depositAmount);

        expect(await vault.totalDeposited()).to.equal(depositAmount);
        expect(await aEurc.balanceOf(await vault.getAddress())).to.equal(depositAmount);
    });

    it("Should revert when depositing zero amount", async function () {
        const { vault, pmo } = await setUpSmartContract();

        await expect(
            vault.connect(pmo).deposit(0)
        ).to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("Should revert when non-whitelisted user tries to deposit", async function () {
        const { vault, eurc, user1 } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(user1).approve(await vault.getAddress(), depositAmount);

        await expect(
            vault.connect(user1).deposit(depositAmount)
        ).to.be.revertedWithCustomError(vault, "NotAuthorized");
    });

    it("Should revert when no allowance is set", async function () {
        const { vault, eurc, pmo } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        // No approve call - should fail on transferFrom with ERC20 error
        await expect(
            vault.connect(pmo).deposit(depositAmount)
        ).to.be.revertedWithCustomError(eurc, "ERC20InsufficientAllowance");
    });

    it("Should track PMO deposits correctly using msg.sender", async function () {
        const { vault, eurc, pmo } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(pmo).approve(await vault.getAddress(), depositAmount);
        await vault.connect(pmo).deposit(depositAmount);

        const [pmoDeposited] = await vault.getPmoInfo(pmo.address);
        expect(pmoDeposited).to.equal(depositAmount);
    });

    it("Should accumulate multiple deposits for same PMO", async function () {
        const { vault, eurc, pmo } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(pmo).approve(await vault.getAddress(), depositAmount * 2n);
        await vault.connect(pmo).deposit(depositAmount);
        await vault.connect(pmo).deposit(depositAmount);

        const [pmoDeposited] = await vault.getPmoInfo(pmo.address);
        expect(pmoDeposited).to.equal(depositAmount * 2n);
        expect(await vault.totalDeposited()).to.equal(depositAmount * 2n);
    });

    it("Should emit Deposited event with depositor address", async function () {
        const { vault, eurc, pmo } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(pmo).approve(await vault.getAddress(), depositAmount);

        await expect(vault.connect(pmo).deposit(depositAmount))
            .to.emit(vault, "Deposited")
            .withArgs(pmo.address, depositAmount);
    });
});

describe("AaveVault - Withdraw", function () {
    it("Should withdraw EURC from Aave to PMO", async function () {
        const { vault, eurc, aEurc, pmo } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        // Setup: PMO deposits first
        await eurc.connect(pmo).approve(await vault.getAddress(), depositAmount);
        await vault.connect(pmo).deposit(depositAmount);

        const pmoBalanceBefore = await eurc.balanceOf(pmo.address);

        // PMO withdraws (directly to PMO wallet)
        await vault.connect(pmo).withdraw(depositAmount);

        expect(await vault.totalWithdrawn()).to.equal(depositAmount);
        expect(await eurc.balanceOf(pmo.address)).to.equal(pmoBalanceBefore + depositAmount);
        expect(await aEurc.balanceOf(await vault.getAddress())).to.equal(0);
    });

    it("Should revert when withdrawing zero amount", async function () {
        const { vault, pmo } = await setUpSmartContract();

        await expect(
            vault.connect(pmo).withdraw(0)
        ).to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("Should revert when non-whitelisted user tries to withdraw", async function () {
        const { vault, user1 } = await setUpSmartContract();
        const withdrawAmount = ethers.parseUnits("100", 6);

        await expect(
            vault.connect(user1).withdraw(withdrawAmount)
        ).to.be.revertedWithCustomError(vault, "NotAuthorized");
    });

    it("Should emit Withdrawn event with depositor address", async function () {
        const { vault, eurc, pmo } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(pmo).approve(await vault.getAddress(), depositAmount);
        await vault.connect(pmo).deposit(depositAmount);

        await expect(vault.connect(pmo).withdraw(depositAmount))
            .to.emit(vault, "Withdrawn")
            .withArgs(pmo.address, depositAmount);
    });

    it("Should track withdrawal for correct PMO", async function () {
        const { vault, eurc, pmo } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(pmo).approve(await vault.getAddress(), depositAmount);
        await vault.connect(pmo).deposit(depositAmount);
        await vault.connect(pmo).withdraw(depositAmount);

        const [pmoDeposited, pmoWithdrawn] = await vault.getPmoInfo(pmo.address);
        expect(pmoDeposited).to.equal(depositAmount);
        expect(pmoWithdrawn).to.equal(depositAmount);
    });
});

describe("AaveVault - getPmoInfo", function () {
    it("Should return correct PMO info after deposit", async function () {
        const { vault, eurc, pmo } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(pmo).approve(await vault.getAddress(), depositAmount);
        await vault.connect(pmo).deposit(depositAmount);

        const [pmoDeposited, pmoWithdrawn] = await vault.getPmoInfo(pmo.address);
        expect(pmoDeposited).to.equal(depositAmount);
        expect(pmoWithdrawn).to.equal(0);
    });

    it("Should return zero for non-existent PMO", async function () {
        const { vault, user1 } = await setUpSmartContract();

        const [pmoDeposited, pmoWithdrawn] = await vault.getPmoInfo(user1.address);
        expect(pmoDeposited).to.equal(0);
        expect(pmoWithdrawn).to.equal(0);
    });

    it("Should be callable by anyone (public view)", async function () {
        const { vault, eurc, pmo, user1 } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(pmo).approve(await vault.getAddress(), depositAmount);
        await vault.connect(pmo).deposit(depositAmount);

        // user1 (not whitelisted, not owner) can still read PMO info
        const [pmoDeposited, pmoWithdrawn] = await vault.connect(user1).getPmoInfo(pmo.address);
        expect(pmoDeposited).to.equal(depositAmount);
        expect(pmoWithdrawn).to.equal(0);
    });
});

describe("AaveVault - getAavePosition", function () {
    it("Should return zero when no deposits made", async function () {
        const { vault } = await setUpSmartContract();

        expect(await vault.getAavePosition()).to.equal(0);
    });

    it("Should return correct aEURC balance after deposit", async function () {
        const { vault, eurc, pmo } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(pmo).approve(await vault.getAddress(), depositAmount);
        await vault.connect(pmo).deposit(depositAmount);

        expect(await vault.getAavePosition()).to.equal(depositAmount);
    });

    it("Should return zero after full withdrawal", async function () {
        const { vault, eurc, pmo } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);

        await eurc.connect(pmo).approve(await vault.getAddress(), depositAmount);
        await vault.connect(pmo).deposit(depositAmount);
        await vault.connect(pmo).withdraw(depositAmount);

        expect(await vault.getAavePosition()).to.equal(0);
    });

    it("Should return partial balance after partial withdrawal", async function () {
        const { vault, eurc, pmo } = await setUpSmartContract();
        const depositAmount = ethers.parseUnits("100", 6);
        const withdrawAmount = ethers.parseUnits("40", 6);

        await eurc.connect(pmo).approve(await vault.getAddress(), depositAmount);
        await vault.connect(pmo).deposit(depositAmount);
        await vault.connect(pmo).withdraw(withdrawAmount);

        expect(await vault.getAavePosition()).to.equal(depositAmount - withdrawAmount);
    });
});
