// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CBT 기여 토큰 조회 인터페이스
/// @notice RewardVault가 보상금 계산에 필요한 CBT 정보만 조회하기 위한 인터페이스다.
interface IContributionToken {
    /// @notice 특정 팀원이 보유한 CBT 수량을 반환한다.
    /// @param account CBT 잔액을 조회할 주소
    /// @return 해당 주소가 보유한 CBT 수량
    function balanceOf(address account) external view returns (uint256);

    /// @notice 현재 발행된 전체 CBT 수량을 반환한다.
    /// @return 전체 CBT 발행량
    function totalSupply() external view returns (uint256);

    /// @notice 프로젝트 기여 지분이 확정되었는지를 반환한다.
    /// @return 확정되었다면 true, 아니라면 false
    function finalized() external view returns (bool);
}

/// @title CBT 기반 프로젝트 보상금 보관소
/// @notice 프로젝트 보상금을 CBT 보유 비율에 따라 계산하고 팀원이 직접 출금하게 한다.
/// @dev CBT 지분이 확정된 이후에만 보상금을 입금할 수 있다.
contract RewardVault is Ownable, ReentrancyGuard {
    /// @notice 보상금 계산에 사용할 CBT 기여 토큰 컨트랙트다.
    IContributionToken public immutable contributionToken;

    /// @notice RewardVault에 지금까지 입금된 전체 보상금이다.
    /// @dev 팀원별 전체 보상 권리를 계산하는 기준이 된다.
    uint256 public totalRewardDeposited;

    /// @notice 각 주소가 지금까지 실제로 출금한 누적 보상금이다.
    mapping(address => uint256) public claimedAmount;

    /// @notice 유효하지 않은 CBT 컨트랙트 주소가 전달되었을 때 발생한다.
    error InvalidTokenAddress();

    /// @notice 프로젝트 기여 지분이 아직 확정되지 않았을 때 발생한다.
    error ProjectNotFinalized();

    /// @notice 입금 금액이 0일 때 발생한다.
    error InvalidDepositAmount();

    /// @notice 전체 CBT 발행량이 0이라 보상금을 계산할 수 없을 때 발생한다.
    error NoContributionSupply();

    /// @notice 현재 출금 가능한 보상금이 없을 때 발생한다.
    error NoRewardAvailable();

    /// @notice ETH 전송에 실패했을 때 발생한다.
    error RewardTransferFailed();

    /// @notice 관리자가 프로젝트 보상금을 입금했을 때 발생한다.
    /// @param depositor 보상금을 입금한 관리자 주소
    /// @param amount 이번에 입금한 ETH 수량
    /// @param totalDeposited 현재까지 누적 입금된 전체 ETH 수량
    event RewardDeposited(address indexed depositor, uint256 amount, uint256 totalDeposited);

    /// @notice 팀원이 자신의 보상금을 출금했을 때 발생한다.
    /// @param member 보상금을 출금한 팀원 주소
    /// @param amount 이번에 출금한 ETH 수량
    /// @param totalClaimed 해당 팀원이 현재까지 출금한 누적 ETH 수량
    event RewardClaimed(address indexed member, uint256 amount, uint256 totalClaimed);

    /// @notice 보상금 계산에 사용할 CBT 컨트랙트 주소를 설정한다.
    /// @param tokenAddress 파트 2에서 배포한 ContributionToken 컨트랙트 주소
    constructor(address tokenAddress) Ownable(msg.sender) {
        // 0 주소를 저장하면 CBT 잔액과 총 발행량을 조회할 수 없으므로 차단한다.
        if (tokenAddress == address(0)) {
            revert InvalidTokenAddress();
        }

        contributionToken = IContributionToken(tokenAddress);
    }

    /// @notice 프로젝트 보상금을 Vault에 입금한다.
    /// @dev 관리자만 호출할 수 있으며 CBT 지분 확정 후에만 입금할 수 있다.
    function depositReward() external payable onlyOwner {
        // 지분이 확정되지 않으면 이후 CBT 수량이 바뀔 수 있어 보상 비율을 신뢰할 수 없다.
        if (!contributionToken.finalized()) {
            revert ProjectNotFinalized();
        }

        // 전체 CBT가 0이면 분모가 0이 되어 보상 비율을 계산할 수 없다.
        if (contributionToken.totalSupply() == 0) {
            revert NoContributionSupply();
        }

        // 0 ETH 입금은 실제 보상금 증가가 없으므로 차단한다.
        if (msg.value == 0) {
            revert InvalidDepositAmount();
        }

        totalRewardDeposited += msg.value;

        emit RewardDeposited(msg.sender, msg.value, totalRewardDeposited);
    }

    /// @notice 특정 팀원이 누적 보상금에서 받을 수 있는 전체 금액을 계산한다.
    /// @param member 보상 권리를 조회할 팀원의 주소
    /// @return 해당 팀원의 전체 누적 보상 권리
    function totalEntitlement(address member) public view returns (uint256) {
        uint256 supply = contributionToken.totalSupply();

        // 전체 CBT가 없거나 입금된 보상금이 없으면 계산 가능한 금액이 없다.
        if (supply == 0 || totalRewardDeposited == 0) {
            return 0;
        }

        uint256 memberBalance = contributionToken.balanceOf(member);

        // CBT를 보유하지 않은 주소는 보상 권리가 없다.
        if (memberBalance == 0) {
            return 0;
        }

        return (totalRewardDeposited * memberBalance) / supply;
    }

    /// @notice 특정 팀원이 현재 추가로 출금할 수 있는 금액을 계산한다.
    /// @param member 출금 가능 금액을 조회할 팀원 주소
    /// @return 현재 출금 가능한 ETH 수량
    function claimable(address member) public view returns (uint256) {
        uint256 entitlement = totalEntitlement(member);
        uint256 alreadyClaimed = claimedAmount[member];

        // 이미 전체 권리만큼 출금했다면 추가로 받을 수 있는 금액이 없다.
        if (alreadyClaimed >= entitlement) {
            return 0;
        }

        return entitlement - alreadyClaimed;
    }

    /// @notice 호출자가 자신의 현재 출금 가능 보상금을 수령한다.
    /// @dev 상태값을 먼저 변경한 뒤 ETH를 전송하여 재진입 공격을 방지한다.
    function claimReward() external nonReentrant {
        uint256 amount = claimable(msg.sender);

        // CBT가 없거나 이미 전액을 출금한 경우 추가 출금을 허용하지 않는다.
        if (amount == 0) {
            revert NoRewardAvailable();
        }

        // 외부 ETH 전송 전에 출금 기록을 먼저 갱신한다.
        claimedAmount[msg.sender] += amount;

        // call을 사용하여 호출자에게 계산된 보상금을 전송한다.
        (bool success, ) = payable(msg.sender).call{value: amount}("");

        // 전송이 실패하면 전체 트랜잭션이 되돌아가므로 출금 기록도 복구된다.
        if (!success) {
            revert RewardTransferFailed();
        }

        emit RewardClaimed(msg.sender, amount, claimedAmount[msg.sender]);
    }

    /// @notice RewardVault에 현재 남아 있는 ETH 잔액을 반환한다.
    /// @return 아직 팀원들이 출금하지 않은 현재 Vault 잔액
    function vaultBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
