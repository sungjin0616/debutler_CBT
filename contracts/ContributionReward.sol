// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CBT 기반 보상 분배 컨트랙트
/// @notice 팀원의 CBT 보유 비율에 따라 로컬 테스트용 ETH를 자동으로 분배한다.
contract ContributionReward is Ownable, ReentrancyGuard {
    /// @notice 보상 분배에 사용할 CBT 토큰 주소다.
    IERC20 public immutable cbtToken;

    /// @notice 분배 대상 팀원 주소 목록이다.
    address[] public members;

    /// @notice 특정 주소가 팀원으로 등록되었는지를 나타낸다.
    mapping(address => bool) public isMember;

    /// @notice 각 팀원이 지금까지 받은 누적 보상금이다.
    mapping(address => uint256) public totalRewardReceived;

    /// @notice 분배를 실행한 총 횟수다.
    uint256 public distributionCount;

    /// @notice 잘못된 CBT 토큰 주소가 전달되었을 때 발생한다.
    error InvalidTokenAddress();

    /// @notice 팀원 등록 시 0 주소를 전달했을 때 발생한다.
    error InvalidMemberAddress();

    /// @notice 이미 등록된 팀원을 다시 등록하려고 할 때 발생한다.
    error MemberAlreadyRegistered();

    /// @notice 입금된 ETH가 없을 때 발생한다.
    error NoRewardAvailable();

    /// @notice CBT 총 발행량이 0이라 분배할 수 없을 때 발생한다.
    error NoContributionSupply();

    /// @notice 등록된 팀원이 없어서 분배할 수 없을 때 발생한다.
    error NoMembersRegistered();

    /// @notice ETH 전송이 실패했을 때 발생한다.
    error RewardTransferFailed();

    /// @notice 팀원이 등록되었을 때 발생한다.
    event MemberAdded(address indexed member);

    /// @notice 관리자가 보상금을 입금했을 때 발생한다.
    event RewardDeposited(address indexed sender, uint256 amount);

    /// @notice 팀원에게 보상금이 분배되었을 때 발생한다.
    event RewardDistributed(address indexed member, uint256 amount);

    /// @notice 분배가 끝났을 때 전체 금액과 팀원 수를 기록한다.
    event DistributionCompleted(uint256 totalAmount, uint256 memberCount);

    /// @notice 배포 시 CBT 토큰 주소를 저장하고 관리자 권한을 설정한다.
    constructor(address tokenAddress) Ownable(msg.sender) {
        // 0 주소를 저장하면 CBT 잔액 조회가 불가능하므로 차단한다.
        if (tokenAddress == address(0)) {
            revert InvalidTokenAddress();
        }

        cbtToken = IERC20(tokenAddress);
    }

    /// @notice 관리자가 팀원을 한 명씩 등록한다.
    /// @dev 중복 등록을 막아 분배 기준이 꼬이지 않도록 한다.
    function addMember(address member) public onlyOwner {
        // 0 주소를 팀원으로 등록하면 이후 계산에 잘못된 기준이 생긴다.
        if (member == address(0)) {
            revert InvalidMemberAddress();
        }

        // 이미 등록된 팀원은 다시 넣으면 분배 대상이 중복되어 잘못된 비율을 만든다.
        if (isMember[member]) {
            revert MemberAlreadyRegistered();
        }

        isMember[member] = true;
        members.push(member);

        emit MemberAdded(member);
    }

    /// @notice 관리자가 여러 팀원을 한 번에 등록한다.
    /// @dev addMember를 반복 호출하는 방식과 동일한 검증을 적용한다.
    function addMembers(address[] calldata memberAddresses) external onlyOwner {
        for (uint256 index = 0; index < memberAddresses.length; index++) {
            addMember(memberAddresses[index]);
        }
    }

    /// @notice 컨트랙트로 ETH 보상금을 입금한다.
    /// @dev 입금 금액이 0이면 실제 분배가 없으므로 거부한다.
    function depositReward() external payable onlyOwner {
        if (msg.value == 0) {
            revert NoRewardAvailable();
        }

        emit RewardDeposited(msg.sender, msg.value);
    }

    /// @notice 컨트랙트 잔액을 조회한다.
    /// @return 남아 있는 ETH 금액
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice 등록된 팀원 주소 목록을 반환한다.
    /// @return 팀원 주소 배열
    function getMembers() external view returns (address[] memory) {
        return members;
    }

    /// @notice 등록된 팀원 수를 반환한다.
    /// @return 팀원 수
    function getMemberCount() external view returns (uint256) {
        return members.length;
    }

    /// @notice 지금 컨트랙트 잔액을 기준으로 특정 팀원의 예상 보상을 계산한다.
    /// @dev 현재 잔액과 CBT 총 발행량을 기준으로 비율을 계산한다.
    function calculateReward(address member) external view returns (uint256) {
        uint256 totalSupply = cbtToken.totalSupply();
        uint256 contractBalance = address(this).balance;

        if (contractBalance == 0 || totalSupply == 0 || !isMember[member]) {
            return 0;
        }

        uint256 memberBalance = cbtToken.balanceOf(member);
        if (memberBalance == 0) {
            return 0;
        }

        return (contractBalance * memberBalance) / totalSupply;
    }

    /// @notice 관리자만 보상금을 CBT 비율대로 팀원에게 분배한다.
    /// @dev 재진입 공격을 막기 위해 상태 변경 전에 외부 전송을 하지 않는다.
    function distributeReward() external onlyOwner nonReentrant {
        uint256 contractBalance = address(this).balance;
        uint256 totalSupply = cbtToken.totalSupply();

        // 분배할 ETH가 없으면 의미 없는 동작이므로 차단한다.
        if (contractBalance == 0) {
            revert NoRewardAvailable();
        }

        // 총 발행량이 0이면 비율이 정의되지 않으므로 차단한다.
        if (totalSupply == 0) {
            revert NoContributionSupply();
        }

        // 등록된 팀원이 없으면 분배 기준이 없으므로 차단한다.
        if (members.length == 0) {
            revert NoMembersRegistered();
        }

        uint256 memberCount = members.length;
        uint256 remainingBalance = contractBalance;

        for (uint256 index = 0; index < memberCount; index++) {
            address member = members[index];
            uint256 memberBalance = cbtToken.balanceOf(member);

            // 보유 CBT가 없는 팀원은 분배 대상에서 제외한다.
            if (memberBalance == 0) {
                continue;
            }

            // 각 팀원에게 받을 금액은 분배 대상 총액에 CBT 비율을 곱한 값이다.
            uint256 rewardAmount = (contractBalance * memberBalance) / totalSupply;

            // 정수 나눗셈으로 남은 wei가 생길 수 있으므로 마지막 팀원에게 남은 금액을 전부 지급한다.
            if (index == memberCount - 1) {
                rewardAmount = remainingBalance;
            }

            if (rewardAmount > 0) {
                // 전송 전에 내부 상태를 먼저 갱신하고, 실패 시 전체 트랜잭션을 되돌린다.
                totalRewardReceived[member] += rewardAmount;
                remainingBalance -= rewardAmount;

                (bool success, ) = payable(member).call{value: rewardAmount}("");
                if (!success) {
                    revert RewardTransferFailed();
                }

                emit RewardDistributed(member, rewardAmount);
            }
        }

        distributionCount += 1;
        emit DistributionCompleted(contractBalance, memberCount);
    }
}
