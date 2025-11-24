import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
const DEFAULT_ADMIN_ROLE: any = ethers.ZeroHash;

async function setUpSmartContract() {
  const [admin, minter, user1, user2]: any = await ethers.getSigners();
  const token = await ethers.deployContract("EFT", [admin.address]);
  await token.connect(admin).grantRole(MINTER_ROLE, minter.address);

  return { token, admin, minter, user1, user2 };
}

describe("Deployment", function () {
  it("Should set the admin role correctly", async function () {
    const {token, admin} = await setUpSmartContract()
    expect(await token.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
  });

  it("Should revert when deploying with zero address as admin", async function () {
    await expect(
        ethers.deployContract("EFT", [ethers.ZeroAddress])
    ).to.be.revertedWith("EFT : admin is zero address");
  });

  it("Should grant minter role correctly", async function () {
    const {token, minter} = await setUpSmartContract()
    expect(await token.hasRole(MINTER_ROLE, minter.address)).to.be.true;
  });

  it("Should set the admin role correctly", async function () {
    const {token, admin} = await setUpSmartContract()
    expect(await token.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
  });
});

describe("Minting", async function () {
  let token: any;
  let admin: any;
  let minter: any;
  let user1: any;
  let user2: any;
  beforeEach(async function () {
    ({token, admin, minter, user1, user2} = await setUpSmartContract())
  });

  it("Should mint tokens successfully", async function () {
    const amount = ethers.parseEther("1000");
    const meterId = "METER_001";

    await token.connect(minter).mint(user1.address, amount, meterId);

    expect(await token.balanceOf(user1.address)).to.equal(amount);
    expect(await token.totalSupply()).to.equal(amount);
  });

  it("Should emit EnergyTokenized event when minting", async function () {
    const amount = ethers.parseEther("500");
    const meterId = "METER_002";

    await expect(token.connect(minter).mint(user1.address, amount, meterId))
        .to.emit(token, "EnergyTokenized")
        .withArgs(user1.address, amount, meterId);
  });

  it("Should allow multiple mints", async function () {
    const amount1 = ethers.parseEther("100");
    const amount2 = ethers.parseEther("200");

    await token.connect(minter).mint(user1.address, amount1, "METER_001");
    await token.connect(minter).mint(user1.address, amount2, "METER_002");

    expect(await token.balanceOf(user1.address)).to.equal(amount1 + amount2);
    expect(await token.totalSupply()).to.equal(amount1 + amount2);
  });

  it("Should revert when minting without MINTER_ROLE", async function () {
    const amount = ethers.parseEther("1000");

    await expect(
        token.connect(user1).mint(user2.address, amount, "METER_001")
    ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
  });

  it("Should revert when minting to zero address", async function () {
    const amount = ethers.parseEther("1000");

    await expect(
        token.connect(minter).mint(ethers.ZeroAddress, amount, "METER_001")
    ).to.be.revertedWithCustomError(token, "ERC20InvalidReceiver");
  });

  it("Should revert when minting zero amount", async function () {
    await expect(
        token.connect(minter).mint(user1.address, 0, "METER_001")
    ).to.be.revertedWith("EFT: mint amount must be positive");
  });

  it("Should revert when minting with empty meterId", async function () {
    const amount = ethers.parseEther("1000");

    await expect(
        token.connect(minter).mint(user1.address, amount, "")
    ).to.be.revertedWith("EFT: meterId required");
  });
});

describe("BurnFrom", function () {
  let token: any;
  let admin: any;
  let minter: any;
  let user1: any;
  let user2: any;
  beforeEach(async function () {
    ({token, admin, minter, user1, user2} = await setUpSmartContract())
    const amount = ethers.parseEther("1000");
    await token.connect(minter).mint(user1.address, amount, "METER_001");
  });

  it("Should emit EnergyBurned event when burning", async function () {
    const burnAmount = ethers.parseEther("200");
    await expect(token.connect(minter).burnFrom(user1.address, burnAmount))
        .to.emit(token, "EnergyBurned")
        .withArgs(user1.address, burnAmount);
  });
});

describe("Transfers", function () {
  let token: any;
  let admin: any;
  let minter: any;
  let user1: any;
  let user2: any;
  beforeEach(async function () {
    ({token, admin, minter, user1, user2} = await setUpSmartContract())
    const amount = ethers.parseEther("1000");
    await token.connect(minter).mint(user1.address, amount, "METER_001");
  });

  it("Should transfer tokens between accounts", async function () {
    const transferAmount = ethers.parseEther("300");

    await token.connect(user1).transfer(user2.address, transferAmount);

    expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("700"));
    expect(await token.balanceOf(user2.address)).to.equal(transferAmount);
  });

  it("Should transfer tokens using transferFrom with approval", async function () {
    const transferAmount = ethers.parseEther("250");

    await token.connect(user1).approve(user2.address, transferAmount);
    await token.connect(user2).transferFrom(user1.address, user2.address, transferAmount);

    expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("750"));
    expect(await token.balanceOf(user2.address)).to.equal(transferAmount);
    expect(await token.allowance(user1.address, user2.address)).to.equal(0n);
  });

  it("Should prevent double counting through transfers", async function () {
    const initialSupply = await token.totalSupply();
    const transferAmount = ethers.parseEther("500");

    await token.connect(user1).transfer(user2.address, transferAmount);

    expect(await token.totalSupply()).to.equal(initialSupply);
    expect(await token.balanceOf(user1.address) + await token.balanceOf(user2.address))
        .to.equal(initialSupply);
  });
});

describe("Role Management", function () {
  let token: any;
  let admin: any;
  let minter: any;
  let user1: any;
  let user2: any;
  beforeEach(async function () {
    ({token, admin, minter, user1, user2} = await setUpSmartContract())
  });

  it("Should allow admin to grant minter role", async function () {
    expect(await token.hasRole(MINTER_ROLE, user1.address)).to.be.false;

    await token.connect(admin).grantRole(MINTER_ROLE, user1.address);

    expect(await token.hasRole(MINTER_ROLE, user1.address)).to.be.true;
  });

  it("Should allow new minter to mint tokens", async function () {
    await token.connect(admin).grantRole(MINTER_ROLE, user1.address);

    const amount = ethers.parseEther("500");
    await token.connect(user1).mint(user2.address, amount, "METER_NEW");

    expect(await token.balanceOf(user2.address)).to.equal(amount);
  });

  it("Should allow admin to revoke minter role", async function () {
    await token.connect(admin).revokeRole(MINTER_ROLE, minter.address);

    expect(await token.hasRole(MINTER_ROLE, minter.address)).to.be.false;

    await expect(
        token.connect(minter).mint(user1.address, ethers.parseEther("100"), "METER_001")
    ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
  });

  it("Should not allow non-admin to grant roles", async function () {
    await expect(
        token.connect(user1).grantRole(MINTER_ROLE, user2.address)
    ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
  });
});

describe("Event Tracking", function () {
  let token: any;
  let admin: any;
  let minter: any;
  let user1: any;
  let user2: any;
  beforeEach(async function () {
    ({token, admin, minter, user1, user2} = await setUpSmartContract())
  });

  it("Should track all energy tokenization events", async function () {
    const deploymentBlockNumber = await ethers.provider.getBlockNumber();

    await token.connect(minter).mint(user1.address, ethers.parseEther("100"), "METER_001");
    await token.connect(minter).mint(user2.address, ethers.parseEther("200"), "METER_002");
    await token.connect(minter).mint(user1.address, ethers.parseEther("150"), "METER_003");

    const events = await token.queryFilter(
        token.filters.EnergyTokenized(),
        deploymentBlockNumber,
        "latest"
    );

    expect(events.length).to.equal(3);

    let totalMinted = 0n;
    for (const event of events) {
      totalMinted += event.args.amount;
    }

    expect(await token.totalSupply()).to.equal(totalMinted);
  });

  it("Should track all energy burn events", async function () {
    const deploymentBlockNumber = await ethers.provider.getBlockNumber();

    await token.connect(minter).mint(user1.address, ethers.parseEther("1000"), "METER_001");

    await token.connect(minter).burnFrom(user1.address, ethers.parseEther("100"));
    await token.connect(minter).burnFrom(user1.address, ethers.parseEther("50"));
    await token.connect(minter).burnFrom(user1.address, ethers.parseEther("75"));

    const events = await token.queryFilter(
        token.filters.EnergyBurned(),
        deploymentBlockNumber,
        "latest"
    );

    expect(events.length).to.equal(3);

    let totalBurned = 0n;
    for (const event of events) {
      totalBurned += event.args.amount;
    }

    expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("1000") - totalBurned);
  });
});
