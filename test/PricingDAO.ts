import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

const PMO_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PMO_ROLE"));
const MEMBER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MEMBER_ROLE"));


const WorkflowStatus = {
  RegisteringVoters: 0,
  ProposalRegistrationStarted: 1,
  ProposalRegistrationEnded: 2,
  VotingSessionStarted: 3,
  VotingSessionEnded: 4,
  VotesTallied: 5
};

const VoteChoice = {
  None: 0,
  For: 1,
  Against: 2,
  Abstain: 3
};

async function setUpPricingDAO() {
  const [pmo, producer1, producer2, consumer1, consumer2, consumer3, user1] = await ethers.getSigners();

  const initialPrice = ethers.parseUnits("0.15", 6); // 0.15 EUR/kWh
  const dao = await ethers.deployContract("PricingDAO", [pmo.address, initialPrice]);

  return { dao, pmo, producer1, producer2, consumer1, consumer2, consumer3, user1 };
}

async function setUpDAOWithProposal() {
  const { dao, pmo, producer1, producer2, consumer1, consumer2, consumer3, user1 } = await setUpPricingDAO();

  await dao.connect(pmo).addMember(producer1.address, true);
  await dao.connect(pmo).addMember(producer2.address, true);
  await dao.connect(pmo).addMember(consumer1.address, false);
  await dao.connect(pmo).addMember(consumer2.address, false);

  await dao.connect(pmo).startProposalRegistration();
  const newPrice = ethers.parseUnits("0.18", 6);
  await dao.connect(pmo).createProposal(newPrice);
  await dao.connect(pmo).endProposalRegistration();
  await dao.connect(pmo).startVotingSession();

  return { dao, pmo, producer1, producer2, consumer1, consumer2, consumer3, user1, newPrice };
}

describe("PricingDAO - Deployment", function () {
  it("Should set the PMO role correctly", async function () {
    const { dao, pmo } = await setUpPricingDAO();
    expect(await dao.hasRole(PMO_ROLE, pmo.address)).to.be.true;
  });

  it("Should set the initial price correctly", async function () {
    const { dao } = await setUpPricingDAO();
    const initialPrice = ethers.parseUnits("0.15", 6);
    expect(await dao.currentPrice()).to.equal(initialPrice);
  });

  it("Should revert when deploying with zero address as PMO", async function () {
    const initialPrice = ethers.parseUnits("0.15", 6);
    await expect(
      ethers.deployContract("PricingDAO", [ethers.ZeroAddress, initialPrice])
    ).to.be.revertedWithCustomError({ interface: (await ethers.getContractFactory("PricingDAO")).interface }, "InvalidAddress");
  });

  it("Should revert when deploying with zero initial price", async function () {
    const [pmo] = await ethers.getSigners();
    await expect(
      ethers.deployContract("PricingDAO", [pmo.address, 0])
    ).to.be.revertedWithCustomError({ interface: (await ethers.getContractFactory("PricingDAO")).interface }, "InvalidPrice");
  });

  it("Should initialize with zero members", async function () {
    const { dao } = await setUpPricingDAO();
    expect(await dao.producersCount()).to.equal(0);
    expect(await dao.consumersCount()).to.equal(0);
  });

  it("Should initialize with no active proposal", async function () {
    const { dao } = await setUpPricingDAO();
    expect(await dao.hasActiveProposal()).to.be.false;
    expect(await dao.proposalCounter()).to.equal(0);
  });
});

describe("PricingDAO - Member Management", function () {
  let dao: any;
  let pmo: any;
  let producer1: any;
  let consumer1: any;
  let user1: any;

  beforeEach(async function () {
    ({ dao, pmo, producer1, consumer1, user1 } = await setUpPricingDAO());
  });

  it("Should add a producer successfully", async function () {
    await dao.connect(pmo).addMember(producer1.address, true);

    expect(await dao.isProducer(producer1.address)).to.be.true;
    expect(await dao.hasRole(MEMBER_ROLE, producer1.address)).to.be.true;
    expect(await dao.producersCount()).to.equal(1);
  });

  it("Should add a consumer successfully", async function () {
    await dao.connect(pmo).addMember(consumer1.address, false);

    expect(await dao.isConsumer(consumer1.address)).to.be.true;
    expect(await dao.hasRole(MEMBER_ROLE, consumer1.address)).to.be.true;
    expect(await dao.consumersCount()).to.equal(1);
  });

  it("Should emit MemberAdded event when adding producer", async function () {
    await expect(dao.connect(pmo).addMember(producer1.address, true))
      .to.emit(dao, "MemberAdded")
      .withArgs(producer1.address, true);
  });

  it("Should emit MemberAdded event when adding consumer", async function () {
    await expect(dao.connect(pmo).addMember(consumer1.address, false))
      .to.emit(dao, "MemberAdded")
      .withArgs(consumer1.address, false);
  });

  it("Should revert when non-PMO tries to add member", async function () {
    await expect(
      dao.connect(user1).addMember(producer1.address, true)
    ).to.be.revertedWithCustomError(dao, "AccessControlUnauthorizedAccount");
  });

  it("Should revert when adding zero address as member", async function () {
    await expect(
      dao.connect(pmo).addMember(ethers.ZeroAddress, true)
    ).to.be.revertedWithCustomError(dao, "InvalidAddress");
  });

  it("Should revert when adding same member twice", async function () {
    await dao.connect(pmo).addMember(producer1.address, true);
    await expect(
      dao.connect(pmo).addMember(producer1.address, false)
    ).to.be.revertedWithCustomError(dao, "MemberAlreadyExists");
  });

  it("Should remove a producer successfully", async function () {
    await dao.connect(pmo).addMember(producer1.address, true);
    await dao.connect(pmo).removeMember(producer1.address);

    expect(await dao.isProducer(producer1.address)).to.be.false;
    expect(await dao.hasRole(MEMBER_ROLE, producer1.address)).to.be.false;
    expect(await dao.producersCount()).to.equal(0);
  });

  it("Should remove a consumer successfully", async function () {
    await dao.connect(pmo).addMember(consumer1.address, false);
    await dao.connect(pmo).removeMember(consumer1.address);

    expect(await dao.isConsumer(consumer1.address)).to.be.false;
    expect(await dao.hasRole(MEMBER_ROLE, consumer1.address)).to.be.false;
    expect(await dao.consumersCount()).to.equal(0);
  });

  it("Should emit MemberRemoved event", async function () {
    await dao.connect(pmo).addMember(producer1.address, true);
    await expect(dao.connect(pmo).removeMember(producer1.address))
      .to.emit(dao, "MemberRemoved")
      .withArgs(producer1.address, true);
  });

  it("Should revert when removing non-existent member", async function () {
    await expect(
      dao.connect(pmo).removeMember(user1.address)
    ).to.be.revertedWithCustomError(dao, "MemberNotFound");
  });
});

describe("PricingDAO - Proposal Creation", function () {
  let dao: any;
  let pmo: any;
  let producer1: any;
  let consumer1: any;

  beforeEach(async function () {
    ({ dao, pmo, producer1, consumer1 } = await setUpPricingDAO());
    await dao.connect(pmo).addMember(producer1.address, true);
    await dao.connect(pmo).addMember(consumer1.address, false);
    await dao.connect(pmo).startProposalRegistration();
  });

  it("Should create a proposal successfully", async function () {
    const newPrice = ethers.parseUnits("0.18", 6);

    await dao.connect(pmo).createProposal(newPrice);

    expect(await dao.hasActiveProposal()).to.be.true;
    expect(await dao.proposalCounter()).to.equal(1);
    expect(await dao.activeProposalId()).to.equal(1);

    const proposal = await dao.getProposal(1);
    expect(proposal.pricePerKWh).to.equal(newPrice);
    expect(proposal.applied).to.be.false;
  });

  it("Should emit ProposalCreated event", async function () {
    const newPrice = ethers.parseUnits("0.18", 6);

    await expect(dao.connect(pmo).createProposal(newPrice))
      .to.emit(dao, "ProposalCreated")
      .withArgs(1, newPrice);
  });

  it("Should revert when creating proposal with zero price", async function () {
    await expect(
      dao.connect(pmo).createProposal(0)
    ).to.be.revertedWithCustomError(dao, "InvalidPrice");
  });

  it("Should revert when active proposal already exists", async function () {
    const newPrice = ethers.parseUnits("0.18", 6);

    await dao.connect(pmo).createProposal(newPrice);

    await expect(
      dao.connect(pmo).createProposal(newPrice)
    ).to.be.revertedWithCustomError(dao, "ProposalAlreadyExists");
  });

  it("Should revert when no producers exist", async function () {
    const { dao: newDao, pmo: newPmo, consumer1: newConsumer } = await setUpPricingDAO();
    await newDao.connect(newPmo).addMember(newConsumer.address, false);

    await expect(
      newDao.connect(newPmo).startProposalRegistration()
    ).to.be.revertedWithCustomError(newDao, "InsufficientMembers");
  });

  it("Should revert when no consumers exist", async function () {
    const { dao: newDao, pmo: newPmo, producer1: newProducer } = await setUpPricingDAO();
    await newDao.connect(newPmo).addMember(newProducer.address, true);

    await expect(
      newDao.connect(newPmo).startProposalRegistration()
    ).to.be.revertedWithCustomError(newDao, "InsufficientMembers");
  });

  it("Should revert when workflow is not in ProposalRegistrationStarted", async function () {
    const { dao: newDao, pmo: newPmo, producer1: newProducer, consumer1: newConsumer } = await setUpPricingDAO();
    await newDao.connect(newPmo).addMember(newProducer.address, true);
    await newDao.connect(newPmo).addMember(newConsumer.address, false);
    // Don't call startProposalRegistration

    const newPrice = ethers.parseUnits("0.18", 6);

    await expect(
      newDao.connect(newPmo).createProposal(newPrice)
    ).to.be.revertedWithCustomError(newDao, "InvalidWorkflowStatus");
  });
});

describe("PricingDAO - Voting", function () {
  let dao: any;
  let pmo: any;
  let producer1: any;
  let producer2: any;
  let consumer1: any;
  let consumer2: any;
  let user1: any;

  beforeEach(async function () {
    ({ dao, pmo, producer1, producer2, consumer1, consumer2, user1 } = await setUpDAOWithProposal());
  });

  it("Should allow producer to vote for", async function () {
    await dao.connect(producer1).vote(VoteChoice.For);

    const vote = await dao.getVote(1, producer1.address);
    expect(vote).to.equal(VoteChoice.For);

    const proposal = await dao.getProposal(1);
    expect(proposal.producersVotedFor).to.equal(1);
  });

  it("Should allow consumer to vote for", async function () {
    await dao.connect(consumer1).vote(VoteChoice.For);

    const vote = await dao.getVote(1, consumer1.address);
    expect(vote).to.equal(VoteChoice.For);

    const proposal = await dao.getProposal(1);
    expect(proposal.consumersVotedFor).to.equal(1);
  });

  it("Should allow producer to vote against", async function () {
    await dao.connect(producer1).vote(VoteChoice.Against);

    const vote = await dao.getVote(1, producer1.address);
    expect(vote).to.equal(VoteChoice.Against);

    const proposal = await dao.getProposal(1);
    expect(proposal.producersVotedAgainst).to.equal(1);
  });

  it("Should allow consumer to vote against", async function () {
    await dao.connect(consumer1).vote(VoteChoice.Against);

    const vote = await dao.getVote(1, consumer1.address);
    expect(vote).to.equal(VoteChoice.Against);

    const proposal = await dao.getProposal(1);
    expect(proposal.consumersVotedAgainst).to.equal(1);
  });

  it("Should allow producer to abstain", async function () {
    await dao.connect(producer1).vote(VoteChoice.Abstain);

    const vote = await dao.getVote(1, producer1.address);
    expect(vote).to.equal(VoteChoice.Abstain);

    const proposal = await dao.getProposal(1);
    expect(proposal.producersVotedFor).to.equal(0);
    expect(proposal.producersVotedAgainst).to.equal(0);
  });

  it("Should allow consumer to abstain", async function () {
    await dao.connect(consumer1).vote(VoteChoice.Abstain);

    const vote = await dao.getVote(1, consumer1.address);
    expect(vote).to.equal(VoteChoice.Abstain);

    const proposal = await dao.getProposal(1);
    expect(proposal.consumersVotedFor).to.equal(0);
    expect(proposal.consumersVotedAgainst).to.equal(0);
  });

  it("Should emit VoteCast event for producer voting for", async function () {
    await expect(dao.connect(producer1).vote(VoteChoice.For))
      .to.emit(dao, "VoteCast")
      .withArgs(1, producer1.address, true, VoteChoice.For);
  });

  it("Should emit VoteCast event for consumer voting against", async function () {
    await expect(dao.connect(consumer1).vote(VoteChoice.Against))
      .to.emit(dao, "VoteCast")
      .withArgs(1, consumer1.address, false, VoteChoice.Against);
  });

  it("Should emit VoteCast event for abstention", async function () {
    await expect(dao.connect(producer1).vote(VoteChoice.Abstain))
      .to.emit(dao, "VoteCast")
      .withArgs(1, producer1.address, true, VoteChoice.Abstain);
  });

  it("Should revert when non-member tries to vote", async function () {
    await expect(
      dao.connect(user1).vote(VoteChoice.For)
    ).to.be.revertedWithCustomError(dao, "AccessControlUnauthorizedAccount");
  });

  it("Should revert when voting twice", async function () {
    await dao.connect(producer1).vote(VoteChoice.For);

    await expect(
      dao.connect(producer1).vote(VoteChoice.Against)
    ).to.be.revertedWithCustomError(dao, "AlreadyVoted");
  });

  it("Should revert when voting session not started", async function () {
    const { dao: newDao, pmo: newPmo, producer1: newProducer, consumer1: newConsumer } = await setUpPricingDAO();
    await newDao.connect(newPmo).addMember(newProducer.address, true);
    await newDao.connect(newPmo).addMember(newConsumer.address, false);

    await expect(
      newDao.connect(newProducer).vote(VoteChoice.For)
    ).to.be.revertedWithCustomError(newDao, "InvalidWorkflowStatus");
  });
});

describe("PricingDAO - Proposal Execution", function () {
  let dao: any;
  let pmo: any;
  let producer1: any;
  let producer2: any;
  let consumer1: any;
  let consumer2: any;
  let newPrice: any;

  beforeEach(async function () {
    ({ dao, pmo, producer1, producer2, consumer1, consumer2, newPrice } = await setUpDAOWithProposal());
  });

  it("Should execute proposal and update price when majority votes for", async function () {
    await dao.connect(producer1).vote(VoteChoice.For);
    await dao.connect(producer2).vote(VoteChoice.For);
    await dao.connect(consumer1).vote(VoteChoice.For);
    await dao.connect(consumer2).vote(VoteChoice.For);

    await dao.connect(pmo).endVotingSession();
    await dao.connect(pmo).executeProposal();

    expect(await dao.currentPrice()).to.equal(newPrice);
    expect(await dao.hasActiveProposal()).to.be.false;
  });

  it("Should keep current price when majority votes against", async function () {
    const oldPrice = await dao.currentPrice();

    await dao.connect(producer1).vote(VoteChoice.Against);
    await dao.connect(producer2).vote(VoteChoice.Against);
    await dao.connect(consumer1).vote(VoteChoice.Against);
    await dao.connect(consumer2).vote(VoteChoice.Against);

    await dao.connect(pmo).endVotingSession();
    await dao.connect(pmo).executeProposal();

    expect(await dao.currentPrice()).to.equal(oldPrice);
  });

  it("Should emit PriceChanged event when price changes", async function () {
    const oldPrice = await dao.currentPrice();

    await dao.connect(producer1).vote(VoteChoice.For);
    await dao.connect(producer2).vote(VoteChoice.For);
    await dao.connect(consumer1).vote(VoteChoice.For);
    await dao.connect(consumer2).vote(VoteChoice.For);

    await dao.connect(pmo).endVotingSession();

    await expect(dao.connect(pmo).executeProposal())
      .to.emit(dao, "PriceChanged")
      .withArgs(1, oldPrice, newPrice);
  });

  it("Should revert when voting session not ended", async function () {
    await expect(
      dao.connect(pmo).executeProposal()
    ).to.be.revertedWithCustomError(dao, "InvalidWorkflowStatus");
  });

  it("Should revert when executing already executed proposal", async function () {
    await dao.connect(producer1).vote(VoteChoice.For);
    await dao.connect(consumer1).vote(VoteChoice.For);

    await dao.connect(pmo).endVotingSession();
    await dao.connect(pmo).executeProposal();

    // After execution, workflow is VotesTallied, so it fails on workflow check first
    await expect(
      dao.connect(pmo).executeProposal()
    ).to.be.revertedWithCustomError(dao, "InvalidWorkflowStatus");
  });

  it("Should allow creating new proposal after reset", async function () {
    await dao.connect(producer1).vote(VoteChoice.For);
    await dao.connect(consumer1).vote(VoteChoice.For);

    await dao.connect(pmo).endVotingSession();
    await dao.connect(pmo).executeProposal();
    await dao.connect(pmo).resetWorkflow();
    await dao.connect(pmo).startProposalRegistration();

    const secondPrice = ethers.parseUnits("0.20", 6);
    await dao.connect(pmo).createProposal(secondPrice);

    expect(await dao.hasActiveProposal()).to.be.true;
    expect(await dao.proposalCounter()).to.equal(2);
  });
});

describe("PricingDAO - Workflow Management", function () {
  let dao: any;
  let pmo: any;
  let producer1: any;
  let consumer1: any;
  let user1: any;

  beforeEach(async function () {
    ({ dao, pmo, producer1, consumer1, user1 } = await setUpPricingDAO());
    await dao.connect(pmo).addMember(producer1.address, true);
    await dao.connect(pmo).addMember(consumer1.address, false);
  });

  it("Should transition through full workflow", async function () {
    await dao.connect(pmo).startProposalRegistration();
    expect(await dao.workflowStatus()).to.equal(WorkflowStatus.ProposalRegistrationStarted);

    const newPrice = ethers.parseUnits("0.18", 6);
    await dao.connect(pmo).createProposal(newPrice);

    await dao.connect(pmo).endProposalRegistration();
    expect(await dao.workflowStatus()).to.equal(WorkflowStatus.ProposalRegistrationEnded);

    await dao.connect(pmo).startVotingSession();
    expect(await dao.workflowStatus()).to.equal(WorkflowStatus.VotingSessionStarted);

    await dao.connect(producer1).vote(VoteChoice.For);
    await dao.connect(consumer1).vote(VoteChoice.For);

    await dao.connect(pmo).endVotingSession();
    expect(await dao.workflowStatus()).to.equal(WorkflowStatus.VotingSessionEnded);

    await dao.connect(pmo).executeProposal();
    expect(await dao.workflowStatus()).to.equal(WorkflowStatus.VotesTallied);

    await dao.connect(pmo).resetWorkflow();
    expect(await dao.workflowStatus()).to.equal(WorkflowStatus.RegisteringVoters);
  });

  it("Should revert when ending proposal without proposal", async function () {
    await dao.connect(pmo).startProposalRegistration();

    await expect(
      dao.connect(pmo).endProposalRegistration()
    ).to.be.revertedWithCustomError(dao, "NoActiveProposal");
  });

  it("Should not allow adding members during voting", async function () {
    await dao.connect(pmo).startProposalRegistration();
    const newPrice = ethers.parseUnits("0.18", 6);
    await dao.connect(pmo).createProposal(newPrice);
    await dao.connect(pmo).endProposalRegistration();
    await dao.connect(pmo).startVotingSession();

    await expect(
      dao.connect(pmo).addMember(user1.address, true)
    ).to.be.revertedWithCustomError(dao, "VotingInProgress");
  });
});

describe("PricingDAO - Role Separation", function () {
  let dao: any;
  let pmo: any;
  let producer1: any;
  let consumer1: any;
  let user1: any;

  beforeEach(async function () {
    ({ dao, pmo, producer1, consumer1, user1 } = await setUpPricingDAO());
  });

  it("Should not allow non-PMO to manage members", async function () {
    await expect(
      dao.connect(user1).addMember(producer1.address, true)
    ).to.be.revertedWithCustomError(dao, "AccessControlUnauthorizedAccount");
  });

  it("Should allow PMO to manage members", async function () {
    await dao.connect(pmo).addMember(producer1.address, true);
    expect(await dao.isProducer(producer1.address)).to.be.true;
  });

  it("Should allow PMO to manage full workflow", async function () {
    await dao.connect(pmo).addMember(producer1.address, true);
    await dao.connect(pmo).addMember(consumer1.address, false);

    await dao.connect(pmo).startProposalRegistration();
    const newPrice = ethers.parseUnits("0.18", 6);
    await dao.connect(pmo).createProposal(newPrice);
    await dao.connect(pmo).endProposalRegistration();
    await dao.connect(pmo).startVotingSession();

    await dao.connect(producer1).vote(VoteChoice.For);
    await dao.connect(consumer1).vote(VoteChoice.For);

    await dao.connect(pmo).endVotingSession();
    await dao.connect(pmo).executeProposal();

    expect(await dao.currentPrice()).to.equal(newPrice);
  });

  it("Should not allow non-PMO to manage workflow", async function () {
    await dao.connect(pmo).addMember(producer1.address, true);
    await dao.connect(pmo).addMember(consumer1.address, false);

    await expect(
      dao.connect(user1).startProposalRegistration()
    ).to.be.revertedWithCustomError(dao, "AccessControlUnauthorizedAccount");
  });
});