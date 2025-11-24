// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title PricingDAO - Gouvernance décentralisée pour le prix local de l'énergie
 * @notice Permet aux membres de voter sur le prix du kWh selon un modèle bi-collège
 * @dev Implémente un système de vote où producteurs et consommateurs ont chacun 50% du poids
 */
// TODO: partie calcul votes
// TODO: voir aussi la logic pour la période du vote
contract PricingDAO is AccessControl {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE; // Address PMO
    bytes32 public constant PRODUCER_ROLE = keccak256("PRODUCER_ROLE");
    bytes32 public constant CONSUMER_ROLE = keccak256("CONSUMER_ROLE");

    enum VoteChoice {
        None,
        For,
        Against,
        Abstain
    }

    struct PriceProposal {
        uint pricePerKWh; // Prix en wei (ex: 0.15 EUR = 150000000000000000 wei)
        uint proposalId;
        bool applied;
        uint snapshotProducersCount;
        uint snapshotConsumersCount;
        uint producersVotedFor;
        uint producersVotedAgainst;
        uint consumersVotedFor;
        uint consumersVotedAgainst;
    }

    uint public currentPrice; // (en wei)
    uint public proposalCounter;
    uint public activeProposalId;
    bool public hasActiveProposal;
    uint public producersCount;
    uint public consumersCount;

    mapping(uint => PriceProposal) public proposals;
    mapping(address => bool) public isProducer;
    mapping(address => bool) public isConsumer;
    mapping(uint => mapping(address => VoteChoice)) public votes;

    event MemberAdded(address indexed member, bool isProducer);
    event MemberRemoved(address indexed member, bool wasProducer);
    event ProposalCreated(uint indexed proposalId, uint pricePerKWh);
    event VoteCast(uint indexed proposalId, address indexed voter, bool isProducer, VoteChoice choice);
    event ProposalExecuted(uint indexed proposalId, uint newPrice);
    event PriceAutoRenewed(uint price);

    /**
     * @notice Initialise le contrat avec un administrateur
     * @param initialAdmin Adresse de l'administrateur initial
     * @param initialPrice Prix initial en wei
     */
    constructor(address initialAdmin, uint initialPrice) {
        require(initialAdmin != address(0), "PricingDAO: admin is zero address");
        require(initialPrice > 0, "PricingDAO: initial price must be positive");

        _grantRole(ADMIN_ROLE, initialAdmin);
        currentPrice = initialPrice;
    }

    /**
     * @notice Ajoute un membre à la DAO
     * @param member Adresse du membre
     * @param _isProducer true si producteur, false si consommateur
     */
    function addMember(address member, bool _isProducer) external onlyRole(ADMIN_ROLE) {
        require(member != address(0), "PricingDAO: member is zero address");
        require(!isProducer[member] && !isConsumer[member], "PricingDAO: member already exists");

        if (_isProducer) {
            _grantRole(PRODUCER_ROLE, member);
            isProducer[member] = true;
            producersCount++;
        } else {
            _grantRole(CONSUMER_ROLE, member);
            isConsumer[member] = true;
            consumersCount++;
        }

        emit MemberAdded(member, _isProducer);
    }

    /**
     * @notice Retire un membre de la DAO
     * @param member Adresse du membre à retirer
     */
    function removeMember(address member) external onlyRole(ADMIN_ROLE) {
        require(isProducer[member] || isConsumer[member], "PricingDAO: member does not exist");

        bool wasProducer = isProducer[member];

        if (isProducer[member]) {
            _revokeRole(PRODUCER_ROLE, member);
            isProducer[member] = false;
            producersCount--;
        } else {
            _revokeRole(CONSUMER_ROLE, member);
            isConsumer[member] = false;
            consumersCount--;
        }

        emit MemberRemoved(member, wasProducer);
    }

    /**
     * @notice Crée une nouvelle proposition de prix
     * @param pricePerKWh Prix proposé en wei
     * @param votingPeriod Durée du vote en secondes
     */
    function createProposal(uint pricePerKWh, uint votingPeriod) external onlyRole(ADMIN_ROLE) {
        require(pricePerKWh > 0, "PricingDAO: price must be positive");
        require(votingPeriod > 0, "PricingDAO: voting period must be positive");
        require(!hasActiveProposal, "PricingDAO: active proposal already exists");
        require(producersCount > 0 && consumersCount > 0, "PricingDAO: need both producers and consumers");

        proposalCounter++;
        activeProposalId = proposalCounter;
        hasActiveProposal = true;

        PriceProposal storage proposal = proposals[proposalCounter];
        proposal.pricePerKWh = pricePerKWh;
        proposal.proposalId = proposalCounter;
        proposal.snapshotProducersCount = producersCount;
        proposal.snapshotConsumersCount = consumersCount;

        emit ProposalCreated(proposalCounter, pricePerKWh);
    }

    /**
     * @notice Vote sur la proposition active
     * @param choice Choix de vote (For, Against, ou Abstain)
     */
    function vote(VoteChoice choice) external {
        require(hasActiveProposal, "PricingDAO: no active proposal");
        require(isProducer[msg.sender] || isConsumer[msg.sender], "PricingDAO: not a member");
        require(choice != VoteChoice.None, "PricingDAO: invalid vote choice");

        PriceProposal storage proposal = proposals[activeProposalId];

        require(votes[activeProposalId][msg.sender] == VoteChoice.None, "PricingDAO: already voted");

        votes[activeProposalId][msg.sender] = choice;

        // Les abstentions sont enregistrées mais ne comptent ni pour ni contre
        if (choice == VoteChoice.Abstain) {
            emit VoteCast(activeProposalId, msg.sender, isProducer[msg.sender], choice);
            return;
        }

        // Cache isProducer check to save gas
        bool _isProducer = isProducer[msg.sender];
        bool _isVoteFor = choice == VoteChoice.For;

        if (_isProducer && _isVoteFor) {
            proposal.producersVotedFor++;
            emit VoteCast(activeProposalId, msg.sender, true, choice);
            return;
        }

        if (_isProducer) {
            proposal.producersVotedAgainst++;
            emit VoteCast(activeProposalId, msg.sender, true, choice);
            return;
        }

        if (_isVoteFor) {
            proposal.consumersVotedFor++;
            emit VoteCast(activeProposalId, msg.sender, false, choice);
            return;
        }

        proposal.consumersVotedAgainst++;
        emit VoteCast(activeProposalId, msg.sender, false, choice);
    }

    /**
     * @notice Obtient le choix de vote d'un membre pour une proposition
     * @param proposalId ID de la proposition
     * @param voter Adresse du votant
     */
    function getVote(uint proposalId, address voter) external view returns (VoteChoice) {
        return votes[proposalId][voter];
    }

    /**
     * @notice Obtient les détails d'une proposition
     * @param proposalId ID de la proposition
     */
    function getProposal(uint proposalId) external view returns (PriceProposal memory) {
        return proposals[proposalId];
    }
}