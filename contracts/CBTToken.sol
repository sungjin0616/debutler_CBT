// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ContributionToken} from "./ContributionToken.sol";

/// @title CBT 토큰 래퍼 컨트랙트
/// @notice 기존 ContributionToken 로직을 유지하면서 요청한 파일명 기준으로 바로 사용할 수 있게 만든 진입점이다.
contract CBTToken is ContributionToken {
    /// @notice 기본 생성자는 부모 컨트랙트의 생성자를 그대로 호출한다.
    constructor() ContributionToken() {}
}
