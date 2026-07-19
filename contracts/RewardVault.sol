// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IContributionToken {
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function sharesFinalized() external view returns (bool);
}

/// @title Reward vault for finalized CBT contribution shares
/// @notice The owner deposits ETH after CBT shares are finalized. Each member claims their own reward once.
contract RewardVault is Ownable, ReentrancyGuard {
    IContributionToken public immutable contributionToken;

    uint256 public totalRewardDeposited;
    mapping(address => uint256) public claimedAmount;
    mapping(address => bool) public hasClaimed;

    error InvalidTokenAddress();
    error ProjectNotFinalized();
    error InvalidDepositAmount();
    error RewardAlreadyDeposited();
    error NoContributionSupply();
    error NoRewardAvailable();
    error RewardAlreadyClaimed();
    error RewardTransferFailed();

    event RewardDeposited(address indexed depositor, uint256 amount, uint256 totalDeposited);
    event RewardClaimed(address indexed member, uint256 amount, uint256 totalClaimed);

    constructor(address tokenAddress) Ownable(msg.sender) {
        if (tokenAddress == address(0)) {
            revert InvalidTokenAddress();
        }

        contributionToken = IContributionToken(tokenAddress);
    }

    function depositReward() external payable onlyOwner {
        if (!contributionToken.sharesFinalized()) {
            revert ProjectNotFinalized();
        }

        if (contributionToken.totalSupply() == 0) {
            revert NoContributionSupply();
        }

        if (msg.value == 0) {
            revert InvalidDepositAmount();
        }

        if (totalRewardDeposited != 0) {
            revert RewardAlreadyDeposited();
        }

        totalRewardDeposited = msg.value;
        emit RewardDeposited(msg.sender, msg.value, totalRewardDeposited);
    }

    function totalEntitlement(address member) public view returns (uint256) {
        uint256 supply = contributionToken.totalSupply();
        if (supply == 0 || totalRewardDeposited == 0) {
            return 0;
        }

        uint256 memberBalance = contributionToken.balanceOf(member);
        if (memberBalance == 0) {
            return 0;
        }

        return (totalRewardDeposited * memberBalance) / supply;
    }

    function claimable(address member) public view returns (uint256) {
        if (hasClaimed[member]) {
            return 0;
        }

        uint256 entitlement = totalEntitlement(member);
        uint256 alreadyClaimed = claimedAmount[member];
        if (alreadyClaimed >= entitlement) {
            return 0;
        }

        return entitlement - alreadyClaimed;
    }

    function claimReward() external nonReentrant {
        if (hasClaimed[msg.sender]) {
            revert RewardAlreadyClaimed();
        }

        uint256 amount = claimable(msg.sender);
        if (amount == 0) {
            revert NoRewardAvailable();
        }

        hasClaimed[msg.sender] = true;
        claimedAmount[msg.sender] = amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) {
            revert RewardTransferFailed();
        }

        emit RewardClaimed(msg.sender, amount, claimedAmount[msg.sender]);
    }

    function vaultBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
