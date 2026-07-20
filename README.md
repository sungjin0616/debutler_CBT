# CBT Contribution Reward Project

이 프로젝트는 Hardhat, Solidity, ethers v6, 그리고 Vite React 프런트엔드를 이용해 로컬 환경에서 CBT 기여 보상 흐름을 테스트할 수 있는 웹 애플리케이션입니다.

메뉴는 다음과 같은 형태로 구성되어 있습니다.

- 기본 설정
- 참여자
- 기여 기준
- CBT 관리
- 지분 상태
- 보상 관리
- 활동 내역

사용자는 메뉴를 자유롭게 이동하며 사용할 수 있습니다. 실제로 실행 가능한 동작은 스마트 컨트랙트 상태에 따라 달라집니다. 예를 들어 `sharesFinalized`, 보상 예치 여부, CBT 잔고, `hasClaimed` 상태에 따라 버튼 활성화가 바뀝니다.

## 사전 준비

다음 환경이 필요합니다.

- Node.js 및 npm
- Git

프로젝트 루트에서 의존성을 설치합니다.

```bash
npm install
cd frontend
npm install
cd ..
```

## 실행 방법

### 1) Hardhat 로컬 노드 실행

첫 번째 터미널에서 아래 명령을 실행합니다.

```bash
npm run node
```

### 2) 스마트 컨트랙트 배포

새 터미널을 열고 아래 명령으로 컨트랙트를 배포합니다.

```bash
npm run deploy:local
```

배포 스크립트는 `scripts/deploy.ts`입니다.

### 3) 프런트엔드 실행

다른 터미널에서 아래 명령을 실행합니다.

```bash
cd frontend
npm run dev
```

브라우저에서 다음 주소로 접속합니다.

```text
http://127.0.0.1:5173
```

프런트엔드는 기본적으로 `http://127.0.0.1:8545`에 연결되어 있으며, Hardhat 계정을 불러와 프로젝트 관리/참여자 설정에 사용합니다.

## 기본 운영 흐름

1. Hardhat 계정 중 참여자를 등록합니다.
2. 목표 CBT 공급량을 설정합니다. 기본값은 100 CBT입니다.
3. 기여 기준과 기본 CBT 수량을 관리합니다.
4. 기준에 따라 CBT를 지급합니다.
5. 잘못 지급한 경우 CBT를 회수할 수 있습니다.
6. 각 참여자의 CBT 잔고와 지분 비율을 확인합니다.
7. 프로젝트 지분을 최종 확정합니다.
8. `RewardVault`에 ETH 보상을 예치합니다.
9. 예상 보상 금액을 확인합니다.
10. 각 참여자가 자신의 지갑으로 보상을 수령합니다.
11. 활동 내역과 트랜잭션 기록을 확인합니다.

## 컨트랙트 규칙

`CBTToken`은 다음 기능을 제공합니다.

- 관리자만 CBT를 지급할 수 있습니다. (`grantContributionToken`)
- 관리자만 CBT를 회수할 수 있습니다. (`revokeContributionToken`)
- 사용자 간 전송을 차단합니다.
- 지분 확정 후 `finalizeShares`로 상태를 변경합니다.
- 지분 확정 이후에는 지급/회수가 불가능합니다.

`RewardVault`는 다음 기능을 제공합니다.

- 지분이 확정된 이후에만 ETH를 예치할 수 있습니다.
- 현재 보상 라운드에 대해 한 번만 예치할 수 있습니다.
- CBT 지분 비율에 따라 보상을 계산합니다.
- 참여자가 직접 `claimReward`로 보상을 수령합니다.
- 중복 수령을 방지합니다. (`hasClaimed`)
- vault 잔고와 수령 완료 금액을 조회할 수 있습니다.

## 로컬 저장소

프런트엔드는 브라우저의 `localStorage`에 다음 정보를 저장합니다.

- `cbt_project_info`
- `cbt_hardhat_account_names`
- `cbt_project_participants`
- `cbt_contribution_criteria`
- `cbt_transaction_history`

이 정보는 블록체인 상태를 변경하지 않습니다. 블록체인 상태를 초기화하려면 Hardhat 노드를 다시 시작하고 컨트랙트를 재배포해야 합니다.

## 검증 및 빌드

프로젝트 루트에서 다음을 실행할 수 있습니다.

```bash
npm run compile
npm test
```

프런트엔드 빌드 확인:

```bash
cd frontend
npm run build
```

Hardhat 노드를 다시 시작했다면, `frontend/contract-addresses.json`이 최신 컨트랙트 주소를 가리키도록 `npm run deploy:local`을 다시 실행해야 합니다.
