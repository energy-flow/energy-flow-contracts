// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title PricingDAO - Decentralized governance for local energy pricing
 * @notice Allows members to vote on kWh price using a bi-college model
 * @dev Implements a voting system where producers and consumers each have 50% weight
 */
contract PricingDAO is AccessControl {
    bytes32 public constant PMO_ROLE = keccak256("PMO_ROLE");
    bytes32 public constant MEMBER_ROLE = keccak256("MEMBER_ROLE");

    enum WorkflowStatus {
        RegisteringVoters,
        ProposalRegistrationStarted,
        ProposalRegistrationEnded,
        VotingSessionStarted,
        VotingSessionEnded,
        VotesTallied
    }

    enum VoteChoice {
        None,
        For,
        Against,
        Abstain
    }

    /// @notice Structure representing a price proposal
    /// @param pricePerKWh Proposed price in wei
    /// @param applied Whether the proposal result has been applied
    struct PriceProposal {
        uint pricePerKWh;
        bool applied;
        uint snapshotProducersCount; // for off-chain tracking
        uint snapshotConsumersCount; // for off-chain tracking
        uint producersVotedFor;
        uint producersVotedAgainst;
        uint consumersVotedFor;
        uint consumersVotedAgainst;
    }

    uint public currentPrice; // in wei
    uint public proposalCounter;
    uint public activeProposalId;
    bool public hasActiveProposal;
    uint public producersCount;
    uint public consumersCount;
    WorkflowStatus public workflowStatus;

    mapping(uint => PriceProposal) public proposals;
    mapping(address => bool) public isProducer;
    mapping(address => bool) public isConsumer;
    mapping(uint => mapping(address => VoteChoice)) public votes;

    // ============ Events ============

    event MemberAdded(address indexed member, bool isProducer);
    event MemberRemoved(address indexed member, bool wasProducer);
    event ProposalCreated(uint indexed proposalId, uint pricePerKWh);
    event VoteCast(uint indexed proposalId, address indexed voter, bool isProducer, VoteChoice choice);
    event WorkflowStatusChange(WorkflowStatus previousStatus, WorkflowStatus newStatus);
    event PriceChanged(uint indexed proposalId, uint oldPrice, uint newPrice);

    error InvalidAddress();
    error InvalidPrice();
    error MemberAlreadyExists();
    error MemberNotFound();
    error VotingInProgress();
    error InvalidWorkflowStatus();
    error ProposalAlreadyExists();
    error InsufficientMembers();
    error NoActiveProposal();
    error InvalidVoteChoice();
    error AlreadyVoted();
    error ProposalAlreadyApplied();

    /**
     * @notice Initializes the contract with a PMO and initial price
     * @param _pmo Address of the local PMO
     * @param _initialPrice Initial price in wei
     */
    constructor(address _pmo, uint _initialPrice) {
        require(_pmo != address(0), InvalidAddress());
        require(_initialPrice != 0, InvalidPrice());

        _grantRole(PMO_ROLE, _pmo);
        currentPrice = _initialPrice;
    }

    // ============ Member Management ============

    /**
     * @notice Adds a member to the DAO
     * @param _member Address of the member
     * @param _isProducer True if producer, false if consumer
     */
    function addMember(address _member, bool _isProducer) external onlyRole(PMO_ROLE) {
        require(workflowStatus != WorkflowStatus.VotingSessionStarted, VotingInProgress());
        require(_member != address(0), InvalidAddress());
        require(!isProducer[_member] && !isConsumer[_member], MemberAlreadyExists());

        _grantRole(MEMBER_ROLE, _member);

        if (_isProducer) {
            isProducer[_member] = true;
            producersCount++;
        } else {
            isConsumer[_member] = true;
            consumersCount++;
        }

        emit MemberAdded(_member, _isProducer);
    }

    /**
     * @notice Removes a member from the DAO
     * @param _member Address of the member to remove
     */
    function removeMember(address _member) external onlyRole(PMO_ROLE) {
        require(workflowStatus != WorkflowStatus.VotingSessionStarted, VotingInProgress());
        require(isProducer[_member] || isConsumer[_member], MemberNotFound());

        bool _wasProducer = isProducer[_member];

        _revokeRole(MEMBER_ROLE, _member);

        if (_wasProducer) {
            isProducer[_member] = false;
            producersCount--;
        } else {
            isConsumer[_member] = false;
            consumersCount--;
        }

        emit MemberRemoved(_member, _wasProducer);
    }

    // ============ Proposal Management ============

    /**
     * @notice Creates a new price proposal
     * @param _pricePerKWh Proposed price in wei
     */
    function createProposal(uint _pricePerKWh) external onlyRole(PMO_ROLE) {
        require(workflowStatus == WorkflowStatus.ProposalRegistrationStarted, InvalidWorkflowStatus());
        require(_pricePerKWh != 0, InvalidPrice());
        require(!hasActiveProposal, ProposalAlreadyExists());

        proposalCounter++;
        activeProposalId = proposalCounter;
        hasActiveProposal = true;

        PriceProposal storage _proposal = proposals[activeProposalId];
        _proposal.pricePerKWh = _pricePerKWh;
        _proposal.snapshotProducersCount = producersCount;
        _proposal.snapshotConsumersCount = consumersCount;

        emit ProposalCreated(proposalCounter, _pricePerKWh);
    }

    // ============ Voting ============

    /**
     * @notice Casts a vote on the active proposal
     * @param _choice Vote choice (For, Against, or Abstain)
     */
    function vote(VoteChoice _choice) external onlyRole(MEMBER_ROLE) {
        require(workflowStatus == WorkflowStatus.VotingSessionStarted, InvalidWorkflowStatus());
        require(hasActiveProposal, NoActiveProposal());
        require(_choice != VoteChoice.None, InvalidVoteChoice());
        require(votes[activeProposalId][msg.sender] == VoteChoice.None, AlreadyVoted());

        votes[activeProposalId][msg.sender] = _choice;

        bool _isProducer = isProducer[msg.sender];

        // Abstentions
        if (_choice == VoteChoice.Abstain) {
            emit VoteCast(activeProposalId, msg.sender, _isProducer, _choice);
            return;
        }

        PriceProposal storage _proposal = proposals[activeProposalId];
        bool _isVoteFor = _choice == VoteChoice.For;

        if (_isProducer && _isVoteFor) {
            _proposal.producersVotedFor++;
            emit VoteCast(activeProposalId, msg.sender, true, _choice);
            return;
        }

        if (_isProducer) {
            _proposal.producersVotedAgainst++;
            emit VoteCast(activeProposalId, msg.sender, true, _choice);
            return;
        }

        if (_isVoteFor) {
            _proposal.consumersVotedFor++;
            emit VoteCast(activeProposalId, msg.sender, false, _choice);
            return;
        }

        _proposal.consumersVotedAgainst++;
        emit VoteCast(activeProposalId, msg.sender, false, _choice);
    }

    // ============ Proposal Execution ============

    /**
     * @notice Executes the proposal after voting ends
     */
    function executeProposal() external onlyRole(PMO_ROLE) {
        // TODO: rajouter une fin de date pour passer en votingSessionEnded plutot que de laisser la PMO décider
        require(workflowStatus == WorkflowStatus.VotingSessionEnded, InvalidWorkflowStatus());
        require(hasActiveProposal, NoActiveProposal());

        PriceProposal storage _proposal = proposals[activeProposalId];
        require(!_proposal.applied, ProposalAlreadyApplied());

        _proposal.applied = true;
        hasActiveProposal = false;

        (uint _totalWeightFor, uint _totalWeightAgainst) = _calculateWeight(_proposal);

        uint _oldPrice = currentPrice;

        // Price is adopted if majority votes for (> 50%)
        if (_totalWeightFor > _totalWeightAgainst) {
            currentPrice = _proposal.pricePerKWh;
            emit PriceChanged(activeProposalId, _oldPrice, currentPrice);
        }

        workflowStatus = WorkflowStatus.VotesTallied;
        emit WorkflowStatusChange(WorkflowStatus.VotingSessionEnded, WorkflowStatus.VotesTallied);
    }

    // ============ Workflow Management ============

    /**
     * @notice Starts the proposal registration phase
     */
    function startProposalRegistration() external onlyRole(PMO_ROLE) {
        require(workflowStatus == WorkflowStatus.RegisteringVoters, InvalidWorkflowStatus());
        require(producersCount != 0 && consumersCount != 0, InsufficientMembers());

        workflowStatus = WorkflowStatus.ProposalRegistrationStarted;
        emit WorkflowStatusChange(WorkflowStatus.RegisteringVoters, WorkflowStatus.ProposalRegistrationStarted);
    }

    /**
     * @notice Ends the proposal registration phase
     */
    function endProposalRegistration() external onlyRole(PMO_ROLE) {
        require(workflowStatus == WorkflowStatus.ProposalRegistrationStarted, InvalidWorkflowStatus());
        require(hasActiveProposal, NoActiveProposal());

        workflowStatus = WorkflowStatus.ProposalRegistrationEnded;
        emit WorkflowStatusChange(WorkflowStatus.ProposalRegistrationStarted, WorkflowStatus.ProposalRegistrationEnded);
    }

    /**
     * @notice Starts the voting session
     */
    function startVotingSession() external onlyRole(PMO_ROLE) {
        require(workflowStatus == WorkflowStatus.ProposalRegistrationEnded, InvalidWorkflowStatus());

        workflowStatus = WorkflowStatus.VotingSessionStarted;
        emit WorkflowStatusChange(WorkflowStatus.ProposalRegistrationEnded, WorkflowStatus.VotingSessionStarted);
    }

    /**
     * @notice Ends the voting session
     */
    function endVotingSession() external onlyRole(PMO_ROLE) {
        require(workflowStatus == WorkflowStatus.VotingSessionStarted, InvalidWorkflowStatus());

        workflowStatus = WorkflowStatus.VotingSessionEnded;
        emit WorkflowStatusChange(WorkflowStatus.VotingSessionStarted, WorkflowStatus.VotingSessionEnded);
    }

    /**
     * @notice Resets the workflow for a new voting cycle
     * @dev Can only be called after votes have been tallied
     */
    function resetWorkflow() external onlyRole(PMO_ROLE) {
        require(workflowStatus == WorkflowStatus.VotesTallied, InvalidWorkflowStatus());

        workflowStatus = WorkflowStatus.RegisteringVoters;
        emit WorkflowStatusChange(WorkflowStatus.VotesTallied, WorkflowStatus.RegisteringVoters);
    }

    // ============ View Functions ============

    /**
     * @notice Gets the vote choice of a member for a proposal
     * @param _proposalId ID of the proposal
     * @param _voter Address of the voter
     * @return Vote choice of the voter
     */
    function getVote(uint _proposalId, address _voter) external view returns (VoteChoice) {
        return votes[_proposalId][_voter];
    }

    /**
     * @notice Gets the details of a proposal
     * @param _proposalId ID of the proposal
     * @return Proposal struct
     */
    function getProposal(uint _proposalId) external view returns (PriceProposal memory) {
        return proposals[_proposalId];
    }

    // ============ Internal Functions ============

    /**
     * @notice Calculates the bi-college weight of a proposal
     * @dev Each college (producers/consumers) weighs 50% of the total vote
     * @param _proposal The proposal to evaluate
     * @return _weightFor Total weight for (out of 10000, i.e., 100.00%)
     * @return _weightAgainst Total weight against (out of 10000, i.e., 100.00%)
     */
    function _calculateWeight(PriceProposal memory _proposal) private pure returns (
        uint _weightFor,
        uint _weightAgainst
    ) {
        // Calculate producer college weight (50% of total)
        uint _producersTotalVotes = _proposal.producersVotedFor + _proposal.producersVotedAgainst;
        uint _producersWeightFor;
        uint _producersWeightAgainst;

        if (_producersTotalVotes > 0) {
            // Uses base of 10000 for precision (50% = 5000, represents 50.00%)
            _producersWeightFor = (_proposal.producersVotedFor * 5000) / _producersTotalVotes;
            _producersWeightAgainst = (_proposal.producersVotedAgainst * 5000) / _producersTotalVotes;
        }

        // Calculate consumer college weight (50% of total)
        uint _consumersTotalVotes = _proposal.consumersVotedFor + _proposal.consumersVotedAgainst;
        uint _consumersWeightFor;
        uint _consumersWeightAgainst;

        if (_consumersTotalVotes > 0) {
            _consumersWeightFor = (_proposal.consumersVotedFor * 5000) / _consumersTotalVotes;
            _consumersWeightAgainst = (_proposal.consumersVotedAgainst * 5000) / _consumersTotalVotes;
        }

        // Total out of 10000 (100.00%)
        _weightFor = _producersWeightFor + _consumersWeightFor;
        _weightAgainst = _producersWeightAgainst + _consumersWeightAgainst;
    }
}