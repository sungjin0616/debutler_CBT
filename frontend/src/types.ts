export type ParticipantSource = "hardhat" | "manual";

export type ParticipantRole = "admin" | "participant";

export type ProjectParticipant = {
  id: string;
  name: string;
  defaultName: string;
  address: string;
  normalizedAddress: string;
  createdAt: string;
  accountIndex: number | null;
  role: ParticipantRole;
  source: ParticipantSource;
  projectRole: string;
  description: string;
};

export type HardhatAccount = {
  id: string;
  name: string;
  defaultName: string;
  address: string;
  normalizedAddress: string;
  accountIndex: number;
  role: ParticipantRole;
};

export type ContributionCriterion = {
  id: string;
  title: string;
  category: string;
  baseTokenAmount: string;
  description: string;
  createdAt: string;
};

export type ProjectInfo = {
  name: string;
  description: string;
  createdAt: string;
  targetCbtSupply: string;
};

export type HistoryAction =
  | "register"
  | "updateParticipant"
  | "deleteParticipant"
  | "criterion"
  | "updateCriterion"
  | "deleteCriterion"
  | "grant"
  | "revoke"
  | "finalize"
  | "deposit"
  | "claim";

export type TransactionHistory = {
  id: string;
  action: HistoryAction;
  participantName?: string;
  address?: string;
  amount?: string;
  memo: string;
  transactionHash?: string;
  blockNumber?: number;
  success?: boolean;
  createdAt: string;
};
