import { useMemo, useState } from "react";
import "./App.css";
import type { Member, ProjectStep } from "./types";

/**
 * 화면이 초기화되었을 때 기본 팀원 데이터를 만든다.
 */
const initialMembers: Member[] = [
  {
    id: "A",
    name: "팀원 A",
    role: "스마트 컨트랙트 개발",
    token: 0,
    share: 0,
    reward: 0,
    claimed: false,
  },
  {
    id: "B",
    name: "팀원 B",
    role: "프론트엔드 개발",
    token: 0,
    share: 0,
    reward: 0,
    claimed: false,
  },
  {
    id: "C",
    name: "팀원 C",
    role: "디자인 및 발표",
    token: 0,
    share: 0,
    reward: 0,
    claimed: false,
  },
];

/**
 * 초기화 시 새로운 객체 배열을 만들기 위한 함수다.
 */
const createInitialMembers = (): Member[] => initialMembers.map((member) => ({ ...member }));

/**
 * 숫자를 화면에 보기 좋게 표현하기 위한 보조 함수다.
 */
const formatNumber = (value: number): string =>
  Number.isInteger(value) ? value.toString() : value.toFixed(1);

/**
 * 내부 단계 값을 사용자가 이해하기 쉬운 한글 문구로 변환한다.
 */
const getStepLabel = (currentStep: ProjectStep): string => {
  switch (currentStep) {
    case "INITIAL":
      return "시작 전";
    case "TOKEN_MINTED":
      return "토큰 지급 완료";
    case "FINALIZED":
      return "지분 확정";
    case "REWARD_DEPOSITED":
      return "보상금 입금 완료";
    case "REWARD_CLAIMED":
      return "분배 완료";
    default:
      return "시작 전";
  }
};

/**
 * 현재 프로젝트가 어느 단계까지 진행되었는지 관리한다.
 */
function App(): JSX.Element {
  const [step, setStep] = useState<ProjectStep>("INITIAL");
  const [members, setMembers] = useState<Member[]>(createInitialMembers());
  const [totalReward, setTotalReward] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("기여 토큰을 지급해주세요.");

  // 현재 모든 팀원이 보유한 CBT를 합산한다.
  const totalToken = useMemo(
    () => members.reduce((sum, member) => sum + member.token, 0),
    [members]
  );

  /**
   * 스마트 컨트랙트에서 관리자가 CBT를 발행하는 과정을 화면으로 재현한다.
   */
  const handleMintTokens = (): void => {
    if (step !== "INITIAL") {
      return;
    }

    setMembers((currentMembers) =>
      currentMembers.map((member) => {
        if (member.id === "A") {
          return { ...member, token: 50 };
        }

        if (member.id === "B") {
          return { ...member, token: 30 };
        }

        return { ...member, token: 20 };
      })
    );

    setStep("TOKEN_MINTED");
    setStatusMessage("A, B, C에게 각각 50, 30, 20 CBT를 지급했습니다.");
  };

  /**
   * 현재 지급된 CBT 비율을 기준으로 프로젝트 지분을 확정한다.
   */
  const handleFinalize = (): void => {
    if (step !== "TOKEN_MINTED" || totalToken === 0) {
      return;
    }

    setMembers((currentMembers) =>
      currentMembers.map((member) => ({
        ...member,
        share: totalToken === 0 ? 0 : (member.token / totalToken) * 100,
      }))
    );

    setStep("FINALIZED");
    setStatusMessage("프로젝트 기여 지분을 50%, 30%, 20%로 확정했습니다.");
  };

  /**
   * 확정된 지분을 기준으로 1 ETH 보상금을 계산한다.
   */
  const handleDepositReward = (): void => {
    if (step !== "FINALIZED") {
      return;
    }

    const depositedReward = 1;

    setMembers((currentMembers) =>
      currentMembers.map((member) => ({
        ...member,
        reward: (depositedReward * member.share) / 100,
      }))
    );

    setTotalReward(depositedReward);
    setStep("REWARD_DEPOSITED");
    setStatusMessage("테스트용 보상금 1 ETH가 입금되어 팀원별 보상금이 계산되었습니다.");
  };

  /**
   * 각 팀원이 자신의 보상금을 직접 수령하는 과정을 화면으로 재현한다.
   */
  const handleClaimRewards = (): void => {
    if (step !== "REWARD_DEPOSITED") {
      return;
    }

    setMembers((currentMembers) =>
      currentMembers.map((member) => ({
        ...member,
        claimed: true,
      }))
    );

    setStep("REWARD_CLAIMED");
    setStatusMessage("A, B, C가 각각 자신의 보상금을 수령했습니다.");
  };

  /**
   * 발표 시연을 처음 상태부터 다시 시작할 수 있도록 모든 값을 초기화한다.
   */
  const handleReset = (): void => {
    setMembers(createInitialMembers());
    setTotalReward(0);
    setStep("INITIAL");
    setStatusMessage("기여 토큰을 지급해주세요.");
  };

  const stepSteps = ["CBT 지급", "지분 확정", "보상금 입금", "보상금 수령"];
  const stepIndex = ["INITIAL", "TOKEN_MINTED", "FINALIZED", "REWARD_DEPOSITED", "REWARD_CLAIMED"].indexOf(step);

  return (
    <div className="app-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">발표용 시뮬레이션</p>
          <h1>ContriSplit</h1>
          <p className="hero-copy">
            팀원의 기여도를 CBT 토큰으로 기록하고, 확정된 지분에 따라 프로젝트 보상금을 분배합니다.
          </p>
        </div>
        <div className={`status-badge ${step.toLowerCase()}`}>{getStepLabel(step)}</div>
      </header>

      <section className="summary-grid" aria-label="요약 카드">
        <article className="summary-card">
          <p className="card-title">총 기여 토큰</p>
          <strong>{totalToken} CBT</strong>
        </article>
        <article className="summary-card">
          <p className="card-title">총 보상금</p>
          <strong>{totalReward} ETH</strong>
        </article>
        <article className="summary-card">
          <p className="card-title">현재 단계</p>
          <strong>{getStepLabel(step)}</strong>
        </article>
      </section>

      <section className="panel">
        <h2>진행 단계</h2>
        <div className="step-list" role="list">
          {stepSteps.map((label, index) => {
            const isDone = index < stepIndex;
            const isCurrent = index === stepIndex - 1;
            const isPending = index >= stepIndex;

            return (
              <div
                key={label}
                className={`step-item ${isDone ? "done" : ""} ${isCurrent ? "current" : ""} ${isPending ? "pending" : ""}`}
              >
                <span className="step-number">{index + 1}</span>
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>팀원별 기여 및 보상</h2>
          <p>이 화면은 실제 컨트랙트 실행이 아니라 발표용 흐름을 시각적으로 재현합니다.</p>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>팀원</th>
                <th>역할</th>
                <th>기여 토큰</th>
                <th>확정 지분</th>
                <th>예상 보상금</th>
                <th>수령 상태</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>{member.name}</td>
                  <td>{member.role}</td>
                  <td>{member.token} CBT</td>
                  <td>{formatNumber(member.share)}%</td>
                  <td>{formatNumber(member.reward)} ETH</td>
                  <td>{member.claimed ? "수령 완료" : "미수령"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="action-buttons">
          <button type="button" onClick={handleMintTokens} disabled={step !== "INITIAL"}>
            기여 토큰 지급
          </button>
          <button type="button" onClick={handleFinalize} disabled={step !== "TOKEN_MINTED"}>
            프로젝트 지분 확정
          </button>
          <button type="button" onClick={handleDepositReward} disabled={step !== "FINALIZED"}>
            테스트용 1 ETH 입금
          </button>
          <button type="button" onClick={handleClaimRewards} disabled={step !== "REWARD_DEPOSITED"}>
            보상금 분배
          </button>
          <button type="button" className="secondary" onClick={handleReset}>
            처음부터 다시
          </button>
        </div>

        <div className="status-message" aria-live="polite">
          {statusMessage}
        </div>
      </section>

      <section className="panel info-panel">
        <h2>실제 스마트 컨트랙트 동작</h2>
        <ol>
          <li>관리자가 팀원의 기여도에 따라 CBT를 지급합니다.</li>
          <li>프로젝트 종료 후 CBT 지분을 확정합니다.</li>
          <li>관리자가 RewardVault에 보상금을 입금합니다.</li>
          <li>각 팀원이 claimReward()를 실행해 자신의 몫을 직접 수령합니다.</li>
        </ol>
      </section>

      <section className="panel notice-panel">
        <h2>발표용 시뮬레이션 안내</h2>
        <p>
          이 화면은 스마트 컨트랙트의 실행 흐름을 React 상태로 시각적으로 재현합니다.
        </p>
        <p>
          실제 CBT 발행, 지분 확정, ETH 입금 및 출금 기능은 Hardhat 테스트와 demo.ts에서 검증됩니다.
        </p>
        <p>
          이 화면은 MetaMask나 실제 블록체인 네트워크와 연결되어 있지 않습니다.
        </p>
      </section>
    </div>
  );
}

export default App;
