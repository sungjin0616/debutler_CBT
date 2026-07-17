// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CBT 기여도 토큰
/// @notice 팀원의 프로젝트 기여도를 CBT 수량으로 기록하는 지분용 토큰이다.
/// @dev CBT는 거래용 토큰이 아니므로 일반 사용자 간 전송을 차단한다.
contract ContributionToken is ERC20, Ownable {
    /// @notice 프로젝트 기여 지분이 최종 확정되었는지를 나타낸다.
    bool public finalized;

    /// @notice 0 주소가 전달되었을 때 발생한다.
    error InvalidMemberAddress();

    /// @notice CBT 수량으로 0이 전달되었을 때 발생한다.
    error InvalidAmount();

    /// @notice 이미 프로젝트 지분이 확정된 상태에서 변경을 시도할 때 발생한다.
    error ProjectAlreadyFinalized();

    /// @notice 프로젝트 지분을 확정할 수 없는 상태일 때 발생한다.
    error CannotFinalizeWithoutSupply();

    /// @notice 일반 사용자 간 CBT 전송을 시도할 때 발생한다.
    error UserTransferNotAllowed();

    /// @notice 팀원에게 CBT가 지급되었을 때 발생한다.
    event ContributionMinted(address indexed member, uint256 amount);

    /// @notice 팀원의 CBT가 회수되었을 때 발생한다.
    event ContributionBurned(address indexed member, uint256 amount);

    /// @notice 프로젝트 기여 지분이 최종 확정되었을 때 발생한다.
    event ProjectFinalized(uint256 totalSupplyValue);

    /// @notice 컨트랙트를 배포한 계정을 최초 관리자라고 설정한다.
    /// @dev Ownable의 초기 관리자로 배포자 주소를 사용한다.
    constructor()
        ERC20("Contribution-Based Token", "CBT")
        Ownable(msg.sender)
    {}

    /// @notice CBT는 정수 단위로만 사용하므로 소수점을 0으로 설정한다.
    /// @return CBT의 소수점 자릿수인 0
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /// @notice 팀원에게 프로젝트 기여도에 해당하는 CBT를 지급한다.
    /// @dev 관리자만 호출할 수 있으며 프로젝트 지분 확정 전까지만 가능하다.
    /// @param member CBT를 지급받을 팀원의 주소
    /// @param amount 지급할 CBT 수량
    function mint(address member, uint256 amount) external onlyOwner {
        // 프로젝트가 확정되면 더 이상 기여도를 변경할 수 없다.
        if (finalized) {
            revert ProjectAlreadyFinalized();
        }

        // 0 주소에 토큰을 발행하면 사용할 수 없는 토큰이 생성되므로 차단한다.
        if (member == address(0)) {
            revert InvalidMemberAddress();
        }

        // 0개 발행은 의미 없는 트랜잭션이므로 차단한다.
        if (amount == 0) {
            revert InvalidAmount();
        }

        _mint(member, amount);
        emit ContributionMinted(member, amount);
    }

    /// @notice 잘못 지급된 CBT를 관리자 권한으로 회수한다.
    /// @dev 일반 ERC-20 approve 방식이 아니라 관리자 권한으로 직접 소각한다.
    /// @param member CBT를 회수할 팀원의 주소
    /// @param amount 회수할 CBT 수량
    function burnFrom(address member, uint256 amount) external onlyOwner {
        // 프로젝트가 확정되면 더 이상 기여도를 변경할 수 없다.
        if (finalized) {
            revert ProjectAlreadyFinalized();
        }

        // 0 주소에서의 소각은 의미 없는 상태 변경이므로 차단한다.
        if (member == address(0)) {
            revert InvalidMemberAddress();
        }

        // 0개를 소각하는 것은 의미가 없으므로 차단한다.
        if (amount == 0) {
            revert InvalidAmount();
        }

        _burn(member, amount);
        emit ContributionBurned(member, amount);
    }

    /// @notice 현재까지 지급된 CBT를 최종 기여 지분으로 확정한다.
    /// @dev 확정 이후에는 추가 발행과 회수가 모두 차단된다.
    function finalize() external onlyOwner {
        // 이미 확정된 프로젝트를 다시 확정할 수 없다.
        if (finalized) {
            revert ProjectAlreadyFinalized();
        }

        // CBT가 하나도 발행되지 않았다면 지분 비율을 계산할 수 없다.
        if (totalSupply() == 0) {
            revert CannotFinalizeWithoutSupply();
        }

        finalized = true;
        emit ProjectFinalized(totalSupply());
    }

    /// @notice CBT의 일반 사용자 간 이동을 차단한다.
    /// @dev 발행과 소각은 허용하고 사용자 주소 간 이동만 차단한다.
    /// @param from CBT를 보내는 주소
    /// @param to CBT를 받는 주소
    /// @param value 이동할 CBT 수량
    function _update(address from, address to, uint256 value) internal override {
        // 발행과 소각이 아닌 일반 사용자 간 이동은 허용하지 않는다.
        if (from != address(0) && to != address(0)) {
            revert UserTransferNotAllowed();
        }

        super._update(from, to, value);
    }
}
