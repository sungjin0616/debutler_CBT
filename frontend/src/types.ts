/**
 * 발표용 화면에서 사용하는 프로젝트 진행 단계다.
 * 각 단계는 스마트 컨트랙트 데모의 실행 순서를 나타낸다.
 */
export type ProjectStep =
  | "INITIAL"
  | "TOKEN_MINTED"
  | "FINALIZED"
  | "REWARD_DEPOSITED"
  | "REWARD_CLAIMED";

/**
 * 프로젝트 팀원의 기여도와 보상 상태를 나타낸다.
 */
export type Member = {
  id: "A" | "B" | "C";
  name: string;
  role: string;
  token: number;
  share: number;
  reward: number;
  claimed: boolean;
};
