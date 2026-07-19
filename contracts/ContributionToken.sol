// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CBT 기여 토큰
/// @notice 프로젝트 기여도를 기록하는 ERC-20 기반 토큰이다.
/// @dev 일반 사용자 간 전송은 막고, 관리자 지급과 회수만 허용한다.
contract ContributionToken is ERC20, Ownable {
    bool public finalized;

    error InvalidMemberAddress();
    error InvalidAmount();
    error ProjectAlreadyFinalized();
    error CannotFinalizeWithoutSupply();
    error UserTransferNotAllowed();
    error InsufficientBalanceForBurn();

    event ContributionMinted(address indexed member, uint256 amount);
    event ContributionTokenGranted(address indexed contributor, uint256 amount, address indexed grantedBy);
    event ContributionBurned(address indexed member, uint256 amount);
    event ContributionTokenRevoked(address indexed contributor, uint256 amount, address indexed revokedBy);
    event ProjectFinalized(uint256 totalSupplyValue);
    event SharesFinalized(uint256 totalSupply, uint256 finalizedAt);

    constructor()
        ERC20("Contribution Based Token", "CBT")
        Ownable(msg.sender)
    {}

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function sharesFinalized() external view returns (bool) {
        return finalized;
    }

    /// @notice 화면 입력 단위의 CBT를 기여자에게 지급한다.
    /// @dev amount가 50이면 내부에서 50 * 10^18 최소 단위로 발행한다.
    function grantContributionToken(address contributor, uint256 amount) external onlyOwner {
        uint256 tokenAmount = _toTokenUnits(amount);
        _mintContribution(contributor, tokenAmount);

        emit ContributionTokenGranted(contributor, amount, msg.sender);
    }

    /// @notice 기존 테스트 호환용 최소 단위 지급 함수다.
    function mint(address member, uint256 amount) external onlyOwner {
        _mintContribution(member, amount);
    }

    /// @notice 화면 입력 단위의 CBT를 회수한다.
    function revokeContributionToken(address contributor, uint256 amount) external onlyOwner {
        uint256 tokenAmount = _toTokenUnits(amount);
        _burnContribution(contributor, tokenAmount);

        emit ContributionTokenRevoked(contributor, amount, msg.sender);
    }

    /// @notice 기존 테스트 호환용 최소 단위 회수 함수다.
    function burnFrom(address member, uint256 amount) external onlyOwner {
        _burnContribution(member, amount);
    }

    function finalizeShares() external onlyOwner {
        _finalize();
    }

    function finalize() external onlyOwner {
        _finalize();
    }

    function _toTokenUnits(uint256 amount) private pure returns (uint256) {
        return amount * (10 ** 18);
    }

    function _mintContribution(address member, uint256 amount) private {
        if (finalized) {
            revert ProjectAlreadyFinalized();
        }

        if (member == address(0)) {
            revert InvalidMemberAddress();
        }

        if (amount == 0) {
            revert InvalidAmount();
        }

        _mint(member, amount);
        emit ContributionMinted(member, amount);
    }

    function _burnContribution(address member, uint256 amount) private {
        if (finalized) {
            revert ProjectAlreadyFinalized();
        }

        if (member == address(0)) {
            revert InvalidMemberAddress();
        }

        if (amount == 0) {
            revert InvalidAmount();
        }

        if (balanceOf(member) < amount) {
            revert InsufficientBalanceForBurn();
        }

        _burn(member, amount);
        emit ContributionBurned(member, amount);
    }

    function _finalize() private {
        if (finalized) {
            revert ProjectAlreadyFinalized();
        }

        if (totalSupply() == 0) {
            revert CannotFinalizeWithoutSupply();
        }

        finalized = true;
        emit ProjectFinalized(totalSupply());
        emit SharesFinalized(totalSupply(), block.timestamp);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            revert UserTransferNotAllowed();
        }

        super._update(from, to, value);
    }

    function transfer(address, uint256) public pure override returns (bool) {
        revert UserTransferNotAllowed();
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert UserTransferNotAllowed();
    }

    function approve(address, uint256) public pure override returns (bool) {
        revert UserTransferNotAllowed();
    }
}
