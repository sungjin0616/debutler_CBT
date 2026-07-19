import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import "./App.css";
import type {
  ContributionCriterion,
  HardhatAccount,
  ProjectInfo,
  ProjectParticipant,
  TransactionHistory,
} from "./types";
import addressData from "../contract-addresses.json";

type MenuKey = "basic" | "participants" | "criteria" | "cbt" | "shares" | "rewards" | "activity";

const RPC_URL = "http://127.0.0.1:8545";
const PROJECT_KEY = "cbt_project_info";
const ACCOUNT_NAMES_KEY = "cbt_hardhat_account_names";
const PARTICIPANTS_KEY = "cbt_project_participants";
const CRITERIA_KEY = "cbt_contribution_criteria";
const HISTORY_KEY = "cbt_transaction_history";

const CBT_ABI = [
  "function grantContributionToken(address contributor,uint256 amount) external",
  "function revokeContributionToken(address contributor,uint256 amount) external",
  "function finalizeShares() external",
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function owner() view returns (address)",
  "function sharesFinalized() view returns (bool)",
];

const VAULT_ABI = [
  "function depositReward() payable external",
  "function claimReward() external",
  "function claimable(address member) view returns (uint256)",
  "function totalEntitlement(address member) view returns (uint256)",
  "function totalRewardDeposited() view returns (uint256)",
  "function claimedAmount(address member) view returns (uint256)",
  "function hasClaimed(address member) view returns (bool)",
  "function vaultBalance() view returns (uint256)",
];

const addresses = addressData as Record<string, string>;
const cbtAddress = addresses.cbtToken || addresses.cbtTokenAddress || "";
const rewardVaultAddress = addresses.rewardVault || addresses.rewardVaultAddress || addresses.contributionReward || "";

const defaultProject: ProjectInfo = {
  name: "CBT 기여도 기반 보상 프로젝트",
  description: "참여자의 기여도를 CBT로 기록하고 확정된 지분에 따라 ETH 보상금을 분배하는 프로젝트",
  createdAt: new Date().toISOString(),
  targetCbtSupply: "100",
};

const defaultCriteria: ContributionCriterion[] = [
  {
    id: "criterion-development",
    title: "스마트 컨트랙트 개발",
    category: "개발",
    baseTokenAmount: "50",
    description: "CBT 발행, 회수, 보상 분배 컨트랙트 구현",
    createdAt: new Date().toISOString(),
  },
  {
    id: "criterion-product",
    title: "서비스 기획",
    category: "기획",
    baseTokenAmount: "30",
    description: "프로젝트 흐름, 기여 기준, 발표 시나리오 정리",
    createdAt: new Date().toISOString(),
  },
  {
    id: "criterion-test",
    title: "검수와 테스트",
    category: "검수",
    baseTokenAmount: "20",
    description: "Hardhat 테스트, 프론트 빌드, 수동 시나리오 확인",
    createdAt: new Date().toISOString(),
  },
];

const menus: Array<{ key: MenuKey; label: string }> = [
  { key: "basic", label: "기본 구성" },
  { key: "participants", label: "참여자" },
  { key: "criteria", label: "기여 기준" },
  { key: "cbt", label: "CBT 관리" },
  { key: "shares", label: "지분 현황" },
  { key: "rewards", label: "보상금 관리" },
  { key: "activity", label: "활동 이력" },
];

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function shorten(value: string): string {
  return value && value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value || "-";
}

function normalize(address: string): string {
  return ethers.getAddress(address.trim());
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatToken(value: bigint, decimals: number): string {
  const formatted = ethers.formatUnits(value, decimals);
  return formatted.includes(".") ? formatted.replace(/\.?0+$/, "") : formatted;
}

function formatEth(value: bigint): string {
  const [whole, fraction = ""] = ethers.formatEther(value).split(".");
  const trimmed = fraction.slice(0, 5).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function percent(balance: bigint, total: bigint): string {
  if (total === 0n) return "0.00%";
  const basisPoints = (balance * 10000n) / total;
  return `${basisPoints / 100n}.${(basisPoints % 100n).toString().padStart(2, "0")}%`;
}

function parsePositiveInteger(value: string): bigint | null {
  const trimmed = value.trim();
  return /^[1-9]\d*$/.test(trimmed) ? BigInt(trimmed) : null;
}

function App(): JSX.Element {
  const provider = useMemo(() => new ethers.JsonRpcProvider(RPC_URL), []);
  const [activeMenu, setActiveMenu] = useState<MenuKey>("basic");
  const [project, setProject] = useState<ProjectInfo>(defaultProject);
  const [targetCbtSupply, setTargetCbtSupply] = useState(defaultProject.targetCbtSupply);
  const [accounts, setAccounts] = useState<HardhatAccount[]>([]);
  const [participants, setParticipants] = useState<ProjectParticipant[]>([]);
  const [criteria, setCriteria] = useState<ContributionCriterion[]>([]);
  const [history, setHistory] = useState<TransactionHistory[]>([]);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [ethBalances, setEthBalances] = useState<Record<string, bigint>>({});
  const [claimables, setClaimables] = useState<Record<string, bigint>>({});
  const [claimedAmounts, setClaimedAmounts] = useState<Record<string, bigint>>({});
  const [claimed, setClaimed] = useState<Record<string, boolean>>({});
  const [totalSupply, setTotalSupply] = useState(0n);
  const [decimals, setDecimals] = useState(18);
  const [owner, setOwner] = useState("");
  const [chainId, setChainId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isCbtDeployed, setIsCbtDeployed] = useState(false);
  const [isVaultDeployed, setIsVaultDeployed] = useState(false);
  const [sharesFinalized, setSharesFinalized] = useState(false);
  const [rewardDeposited, setRewardDeposited] = useState(0n);
  const [vaultBalance, setVaultBalance] = useState(0n);
  const [status, setStatus] = useState("Hardhat 로컬 상태를 불러오는 중입니다.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [participantSearch, setParticipantSearch] = useState("");
  const [criterionSearch, setCriterionSearch] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [manualRole, setManualRole] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [editingParticipantId, setEditingParticipantId] = useState("");
  const [editParticipantName, setEditParticipantName] = useState("");
  const [editParticipantRole, setEditParticipantRole] = useState("");
  const [editParticipantDescription, setEditParticipantDescription] = useState("");

  const [criterionTitle, setCriterionTitle] = useState("");
  const [criterionCategory, setCriterionCategory] = useState("");
  const [criterionAmount, setCriterionAmount] = useState("");
  const [criterionDescription, setCriterionDescription] = useState("");
  const [editingCriterionId, setEditingCriterionId] = useState("");
  const [editCriterionTitle, setEditCriterionTitle] = useState("");
  const [editCriterionCategory, setEditCriterionCategory] = useState("");
  const [editCriterionAmount, setEditCriterionAmount] = useState("");
  const [editCriterionDescription, setEditCriterionDescription] = useState("");

  const [grantParticipantId, setGrantParticipantId] = useState("");
  const [grantCriterionId, setGrantCriterionId] = useState("");
  const [adjustment, setAdjustment] = useState("0");
  const [grantMemo, setGrantMemo] = useState("");
  const [revokeParticipantId, setRevokeParticipantId] = useState("");
  const [revokeAmount, setRevokeAmount] = useState("");
  const [revokeMemo, setRevokeMemo] = useState("");
  const [depositAmount, setDepositAmount] = useState("1");

  const adminAccount = accounts[0] ?? null;
  const participantAddressSet = useMemo(
    () => new Set(participants.map((participant) => participant.normalizedAddress.toLowerCase())),
    [participants]
  );
  const candidateAccounts = accounts.filter(
    (account) => account.role !== "admin" && !participantAddressSet.has(account.normalizedAddress.toLowerCase())
  );
  const selectedCriterion = criteria.find((item) => item.id === grantCriterionId) ?? null;
  const baseGrantAmount = selectedCriterion ? Number(selectedCriterion.baseTokenAmount) : 0;
  const finalGrantAmount = baseGrantAmount + Number(adjustment || 0);
  const targetCbtSupplyValue = parsePositiveInteger(targetCbtSupply) ?? 100n;
  const tokenUnitMultiplier = 10n ** BigInt(decimals);
  const targetCbtSupplyUnits = targetCbtSupplyValue * tokenUnitMultiplier;
  const remainingCbtSupplyUnits = targetCbtSupplyUnits > totalSupply ? targetCbtSupplyUnits - totalSupply : 0n;
  const finalGrantAmountUnits =
    finalGrantAmount > 0 && Number.isInteger(finalGrantAmount) ? BigInt(finalGrantAmount) * tokenUnitMultiplier : 0n;
  const wouldExceedTargetSupply = finalGrantAmountUnits > remainingCbtSupplyUnits;
  const rewardEligibleParticipants = participants.filter((participant) => (balances[participant.normalizedAddress] ?? 0n) > 0n);
  const claimedCount = rewardEligibleParticipants.filter((participant) => claimed[participant.normalizedAddress]).length;
  const claimedTotal = rewardEligibleParticipants.reduce((sum, participant) => sum + (claimedAmounts[participant.normalizedAddress] ?? 0n), 0n);
  const settlementProgress =
    rewardEligibleParticipants.length === 0 ? 0 : Math.round((claimedCount / rewardEligibleParticipants.length) * 100);

  const projectStatus = useMemo(() => {
    if (rewardDeposited > 0n && rewardEligibleParticipants.length > 0 && claimedCount === rewardEligibleParticipants.length) {
      return "정산 완료";
    }
    if (rewardDeposited > 0n && claimedCount > 0) return "보상금 정산 중";
    if (rewardDeposited > 0n) return "보상금 예치 완료";
    if (sharesFinalized) return "지분 확정 완료";
    if (participants.length > 0 && totalSupply > 0n) return "기여도 산정 중";
    return "참여자 구성 중";
  }, [claimedCount, participants.length, rewardDeposited, rewardEligibleParticipants.length, sharesFinalized, totalSupply]);

  const availableActions = useMemo(() => {
    if (!sharesFinalized) {
      return [
        "Hardhat 계정에서 프로젝트 참여자 추가",
        "참여자 이름과 역할 설정",
        "기여 기준 등록과 수정",
        "CBT 지급, 회수, 조정",
        "현재 지분 확인 후 최종 확정",
      ];
    }
    if (rewardDeposited === 0n) return ["최종 지분 확인", "RewardVault에 ETH 보상금 예치"];
    if (claimedCount < rewardEligibleParticipants.length) return ["예상 보상 확인", "참여자별 ETH 보상금 직접 출금", "정산 진행률 확인"];
    return ["정산 결과 확인", "프로젝트 활동 이력 검토"];
  }, [claimedCount, rewardDeposited, rewardEligibleParticipants.length, sharesFinalized]);

  function pushHistory(item: Omit<TransactionHistory, "id" | "createdAt" | "success"> & { success?: boolean }): void {
    const next = [
      {
        id: uid("history"),
        createdAt: new Date().toISOString(),
        success: item.success ?? true,
        ...item,
      },
      ...history,
    ].slice(0, 100);
    setHistory(next);
    writeStorage(HISTORY_KEY, next);
  }

  async function refreshState(targetParticipants = participants): Promise<void> {
    try {
      setError("");
      const [rpcAccounts, network] = await Promise.all([provider.send("eth_accounts", []), provider.getNetwork()]);
      const names = readStorage<Record<string, string>>(ACCOUNT_NAMES_KEY, {});
      const nextAccounts = rpcAccounts.map((address: string, index: number) => {
        const normalizedAddress = normalize(address);
        const defaultName = index === 0 ? "관리자" : `참여자 ${index}`;
        return {
          id: `hardhat-${index}`,
          name: names[normalizedAddress] || defaultName,
          defaultName,
          address: normalizedAddress,
          normalizedAddress,
          accountIndex: index,
          role: index === 0 ? "admin" : "participant",
        } satisfies HardhatAccount;
      });

      setAccounts(nextAccounts);
      setChainId(network.chainId.toString());
      setIsConnected(true);

      const [cbtCode, vaultCode] = await Promise.all([provider.getCode(cbtAddress), provider.getCode(rewardVaultAddress)]);
      const cbtDeployed = Boolean(cbtAddress && cbtCode !== "0x");
      const vaultDeployed = Boolean(rewardVaultAddress && vaultCode !== "0x");
      setIsCbtDeployed(cbtDeployed);
      setIsVaultDeployed(vaultDeployed);

      const nextEthBalances: Record<string, bigint> = {};
      const nextBalances: Record<string, bigint> = {};
      const nextClaimables: Record<string, bigint> = {};
      const nextClaimedAmounts: Record<string, bigint> = {};
      const nextClaimed: Record<string, boolean> = {};
      const balanceTargets = [...nextAccounts, ...targetParticipants];

      await Promise.all(
        balanceTargets.map(async (item) => {
          try {
            nextEthBalances[item.normalizedAddress] = await provider.getBalance(item.normalizedAddress);
          } catch {
            nextEthBalances[item.normalizedAddress] = 0n;
          }
        })
      );

      if (cbtDeployed) {
        const cbt = new ethers.Contract(cbtAddress, CBT_ABI, provider);
        const [latestDecimals, latestSupply, latestOwner, finalized] = await Promise.all([
          cbt.decimals(),
          cbt.totalSupply(),
          cbt.owner(),
          cbt.sharesFinalized(),
        ]);
        setDecimals(Number(latestDecimals));
        setTotalSupply(latestSupply);
        setOwner(latestOwner);
        setSharesFinalized(finalized);

        await Promise.all(
          targetParticipants.map(async (participant) => {
            nextBalances[participant.normalizedAddress] = await cbt.balanceOf(participant.normalizedAddress);
          })
        );
      } else {
        setOwner("");
        setTotalSupply(0n);
        setSharesFinalized(false);
      }

      if (vaultDeployed) {
        const vault = new ethers.Contract(rewardVaultAddress, VAULT_ABI, provider);
        const [deposited, currentVaultBalance] = await Promise.all([vault.totalRewardDeposited(), vault.vaultBalance()]);
        setRewardDeposited(deposited);
        setVaultBalance(currentVaultBalance);

        await Promise.all(
          targetParticipants.map(async (participant) => {
            nextClaimables[participant.normalizedAddress] = await vault.claimable(participant.normalizedAddress);
            nextClaimedAmounts[participant.normalizedAddress] = await vault.claimedAmount(participant.normalizedAddress);
            nextClaimed[participant.normalizedAddress] = await vault.hasClaimed(participant.normalizedAddress);
          })
        );
      } else {
        setRewardDeposited(0n);
        setVaultBalance(0n);
      }

      setEthBalances(nextEthBalances);
      setBalances(nextBalances);
      setClaimables(nextClaimables);
      setClaimedAmounts(nextClaimedAmounts);
      setClaimed(nextClaimed);
      setStatus("프로젝트 상태를 최신 Hardhat 블록체인 값으로 갱신했습니다.");
    } catch (refreshError) {
      console.error(refreshError);
      setIsConnected(false);
      setError("Hardhat 로컬 노드에 연결할 수 없습니다. 프로젝트 루트에서 npm run node를 실행해주세요.");
    }
  }

  useEffect(() => {
    const storedProject = { ...defaultProject, ...readStorage<ProjectInfo>(PROJECT_KEY, defaultProject) };
    const storedParticipants = readStorage<ProjectParticipant[]>(PARTICIPANTS_KEY, []);
    const storedCriteria = readStorage<ContributionCriterion[]>(CRITERIA_KEY, defaultCriteria);
    setProject(storedProject);
    setTargetCbtSupply(storedProject.targetCbtSupply || defaultProject.targetCbtSupply);
    setParticipants(storedParticipants);
    setCriteria(storedCriteria);
    setHistory(readStorage<TransactionHistory[]>(HISTORY_KEY, []));
    void refreshState(storedParticipants);
    // Menu navigation is visual only; execution rules are refreshed from contracts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveParticipants(next: ProjectParticipant[]): void {
    setParticipants(next);
    writeStorage(PARTICIPANTS_KEY, next);
    void refreshState(next);
  }

  function saveCriteria(next: ContributionCriterion[]): void {
    setCriteria(next);
    writeStorage(CRITERIA_KEY, next);
  }

  function saveTargetCbtSupply(): void {
    const amount = parsePositiveInteger(targetCbtSupply);
    if (!amount) {
      setError("전체 CBT 목표량은 1 이상의 정수로 입력해주세요.");
      return;
    }

    const nextProject = { ...project, targetCbtSupply: amount.toString() };
    setProject(nextProject);
    setTargetCbtSupply(amount.toString());
    writeStorage(PROJECT_KEY, nextProject);
    setError("");
    setStatus(`프로젝트 전체 CBT 목표량을 ${amount.toString()} CBT로 저장했습니다.`);
  }

  function saveAccountName(account: HardhatAccount, value: string): void {
    const names = readStorage<Record<string, string>>(ACCOUNT_NAMES_KEY, {});
    const name = value.trim();
    if (name) names[account.normalizedAddress] = name;
    else delete names[account.normalizedAddress];
    writeStorage(ACCOUNT_NAMES_KEY, names);
    void refreshState();
  }

  function addHardhatParticipant(account: HardhatAccount): void {
    if (sharesFinalized) {
      setError("지분이 확정된 뒤에는 참여자를 추가할 수 없습니다.");
      return;
    }
    const next = [
      ...participants,
      {
        id: uid("participant"),
        name: account.name,
        defaultName: account.defaultName,
        address: account.normalizedAddress,
        normalizedAddress: account.normalizedAddress,
        createdAt: new Date().toISOString(),
        accountIndex: account.accountIndex,
        role: "participant" as const,
        source: "hardhat" as const,
        projectRole: "기여자",
        description: "Hardhat 계정 후보에서 등록",
      },
    ];
    saveParticipants(next);
    pushHistory({ action: "register", participantName: account.name, address: account.normalizedAddress, memo: "Hardhat 계정을 프로젝트 참여자로 등록" });
  }

  function addManualParticipant(): void {
    if (sharesFinalized) {
      setError("지분이 확정된 뒤에는 참여자를 추가할 수 없습니다.");
      return;
    }
    if (!manualName.trim() || !manualAddress.trim() || !ethers.isAddress(manualAddress)) {
      setError("이름과 올바른 지갑 주소를 입력해주세요.");
      return;
    }
    const normalizedAddress = normalize(manualAddress);
    if (participantAddressSet.has(normalizedAddress.toLowerCase())) {
      setError("이미 등록된 참여자 주소입니다.");
      return;
    }

    const next = [
      ...participants,
      {
        id: uid("participant"),
        name: manualName.trim(),
        defaultName: manualName.trim(),
        address: normalizedAddress,
        normalizedAddress,
        createdAt: new Date().toISOString(),
        accountIndex: null,
        role: "participant" as const,
        source: "manual" as const,
        projectRole: manualRole.trim() || "기여자",
        description: manualDescription.trim(),
      },
    ];
    saveParticipants(next);
    pushHistory({ action: "register", participantName: manualName.trim(), address: normalizedAddress, memo: "직접 입력한 주소를 프로젝트 참여자로 등록" });
    setManualName("");
    setManualAddress("");
    setManualRole("");
    setManualDescription("");
  }

  function startParticipantEdit(participant: ProjectParticipant): void {
    setEditingParticipantId(participant.id);
    setEditParticipantName(participant.name);
    setEditParticipantRole(participant.projectRole);
    setEditParticipantDescription(participant.description);
  }

  function saveParticipantEdit(participant: ProjectParticipant): void {
    if (!editParticipantName.trim()) {
      setError("참여자 이름은 비워둘 수 없습니다.");
      return;
    }
    const next = participants.map((item) =>
      item.id === participant.id
        ? {
            ...item,
            name: editParticipantName.trim(),
            projectRole: editParticipantRole.trim() || "기여자",
            description: editParticipantDescription.trim(),
          }
        : item
    );
    saveParticipants(next);
    pushHistory({ action: "updateParticipant", participantName: editParticipantName.trim(), address: participant.normalizedAddress, memo: "참여자 표시 정보 변경" });
    setEditingParticipantId("");
  }

  function deleteParticipant(participant: ProjectParticipant): void {
    if (sharesFinalized) {
      setError("지분이 확정된 뒤에는 참여자를 삭제할 수 없습니다.");
      return;
    }
    if (!window.confirm(`${participant.name} 참여자를 프로젝트에서 제거할까요? 이미 지급된 CBT는 삭제되지 않습니다.`)) return;
    const next = participants.filter((item) => item.id !== participant.id);
    saveParticipants(next);
    pushHistory({ action: "deleteParticipant", participantName: participant.name, address: participant.normalizedAddress, memo: "프로젝트 참여자 목록에서 제거" });
  }

  async function copyAddress(address: string): Promise<void> {
    await navigator.clipboard?.writeText(address);
    setStatus("주소를 클립보드에 복사했습니다.");
  }

  function addCriterion(): void {
    if (sharesFinalized) {
      setError("지분이 확정된 뒤에는 기여 기준을 변경할 수 없습니다.");
      return;
    }
    const amount = parsePositiveInteger(criterionAmount);
    if (!criterionTitle.trim() || !amount) {
      setError("기준명과 1 이상의 기본 CBT 수량을 입력해주세요.");
      return;
    }
    const next = [
      ...criteria,
      {
        id: uid("criterion"),
        title: criterionTitle.trim(),
        category: criterionCategory.trim() || "일반",
        baseTokenAmount: amount.toString(),
        description: criterionDescription.trim(),
        createdAt: new Date().toISOString(),
      },
    ];
    saveCriteria(next);
    pushHistory({ action: "criterion", amount: `${amount.toString()} CBT`, memo: `기여 기준 등록: ${criterionTitle.trim()}` });
    setCriterionTitle("");
    setCriterionCategory("");
    setCriterionAmount("");
    setCriterionDescription("");
  }

  function startCriterionEdit(criterion: ContributionCriterion): void {
    setEditingCriterionId(criterion.id);
    setEditCriterionTitle(criterion.title);
    setEditCriterionCategory(criterion.category);
    setEditCriterionAmount(criterion.baseTokenAmount);
    setEditCriterionDescription(criterion.description);
  }

  function saveCriterionEdit(criterion: ContributionCriterion): void {
    const amount = parsePositiveInteger(editCriterionAmount);
    if (sharesFinalized || !editCriterionTitle.trim() || !amount) {
      setError("지분 확정 전 상태에서 기준명과 1 이상의 CBT 수량을 입력해야 합니다.");
      return;
    }
    const next = criteria.map((item) =>
      item.id === criterion.id
        ? {
            ...item,
            title: editCriterionTitle.trim(),
            category: editCriterionCategory.trim() || "일반",
            baseTokenAmount: amount.toString(),
            description: editCriterionDescription.trim(),
          }
        : item
    );
    saveCriteria(next);
    pushHistory({ action: "updateCriterion", amount: `${amount.toString()} CBT`, memo: `기여 기준 수정: ${editCriterionTitle.trim()}` });
    setEditingCriterionId("");
  }

  function deleteCriterion(criterion: ContributionCriterion): void {
    if (sharesFinalized) {
      setError("지분이 확정된 뒤에는 기여 기준을 삭제할 수 없습니다.");
      return;
    }
    const next = criteria.filter((item) => item.id !== criterion.id);
    saveCriteria(next);
    pushHistory({ action: "deleteCriterion", memo: `기여 기준 삭제: ${criterion.title}` });
  }

  async function grantCbt(): Promise<void> {
    const participant = participants.find((item) => item.id === grantParticipantId);
    if (!participant || !selectedCriterion || finalGrantAmount <= 0) {
      setError("참여자, 기여 기준, 최종 CBT 수량을 확인해주세요.");
      return;
    }
    if (!Number.isInteger(finalGrantAmount)) {
      setError("최종 CBT 수량은 정수여야 합니다.");
      return;
    }
    if (wouldExceedTargetSupply) {
      setError("설정한 전체 CBT 목표량을 초과해서 지급할 수 없습니다. 기본 구성에서 목표량을 늘리거나 기존 CBT를 회수해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const signer = await provider.getSigner(0);
      const cbt = new ethers.Contract(cbtAddress, CBT_ABI, signer);
      const tx = await cbt.grantContributionToken(participant.normalizedAddress, BigInt(finalGrantAmount));
      const receipt = await tx.wait();
      pushHistory({
        action: "grant",
        participantName: participant.name,
        address: participant.normalizedAddress,
        amount: `${finalGrantAmount} CBT`,
        memo: grantMemo.trim() || `${selectedCriterion.title} 기준으로 CBT 지급`,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });
      setGrantMemo("");
      await refreshState();
    } catch (txError) {
      console.error(txError);
      setError("CBT 지급에 실패했습니다. 관리자 계정과 지분 확정 상태를 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeCbt(): Promise<void> {
    const participant = participants.find((item) => item.id === revokeParticipantId);
    const amount = parsePositiveInteger(revokeAmount);
    if (!participant || !amount) {
      setError("회수할 참여자와 1 이상의 CBT 수량을 입력해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const signer = await provider.getSigner(0);
      const cbt = new ethers.Contract(cbtAddress, CBT_ABI, signer);
      const tx = await cbt.revokeContributionToken(participant.normalizedAddress, amount);
      const receipt = await tx.wait();
      pushHistory({
        action: "revoke",
        participantName: participant.name,
        address: participant.normalizedAddress,
        amount: `${amount.toString()} CBT`,
        memo: revokeMemo.trim() || "CBT 회수 또는 조정",
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });
      setRevokeAmount("");
      setRevokeMemo("");
      await refreshState();
    } catch (txError) {
      console.error(txError);
      setError("CBT 회수에 실패했습니다. 보유량보다 많이 회수했거나 지분이 확정되었을 수 있습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function finalizeShares(): Promise<void> {
    if (!window.confirm("현재 CBT 분배 결과를 프로젝트의 최종 지분으로 확정할까요?\n확정 후에는 CBT를 추가 지급하거나 회수할 수 없습니다.")) return;
    setBusy(true);
    setError("");
    try {
      const signer = await provider.getSigner(0);
      const cbt = new ethers.Contract(cbtAddress, CBT_ABI, signer);
      const tx = await cbt.finalizeShares();
      const receipt = await tx.wait();
      pushHistory({
        action: "finalize",
        amount: `${formatToken(totalSupply, decimals)} CBT`,
        memo: "현재 CBT 분배 결과를 최종 지분으로 확정",
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });
      await refreshState();
    } catch (txError) {
      console.error(txError);
      setError("지분 확정에 실패했습니다. 전체 CBT가 0이면 확정할 수 없습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function depositReward(): Promise<void> {
    if (Number(depositAmount) <= 0) {
      setError("0보다 큰 ETH 보상금을 입력해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const signer = await provider.getSigner(0);
      const vault = new ethers.Contract(rewardVaultAddress, VAULT_ABI, signer);
      const tx = await vault.depositReward({ value: ethers.parseEther(depositAmount) });
      const receipt = await tx.wait();
      pushHistory({
        action: "deposit",
        amount: `${depositAmount} ETH`,
        memo: "RewardVault에 프로젝트 보상금 예치",
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });
      await refreshState();
    } catch (txError) {
      console.error(txError);
      setError("보상금 예치에 실패했습니다. 지분 확정 이후, 아직 예치 전 상태에서만 가능합니다.");
    } finally {
      setBusy(false);
    }
  }

  async function claimReward(participant: ProjectParticipant): Promise<void> {
    if (participant.accountIndex === null) {
      setError("수동 등록 주소는 브라우저에서 Hardhat signer를 찾을 수 없어 직접 출금을 실행할 수 없습니다.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const signer = await provider.getSigner(participant.accountIndex);
      const vault = new ethers.Contract(rewardVaultAddress, VAULT_ABI, signer);
      const claimableBefore = claimables[participant.normalizedAddress] ?? 0n;
      const tx = await vault.claimReward();
      const receipt = await tx.wait();
      pushHistory({
        action: "claim",
        participantName: participant.name,
        address: participant.normalizedAddress,
        amount: `${formatEth(claimableBefore)} ETH`,
        memo: "참여자 본인 Hardhat 계정으로 ETH 보상금 출금",
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });
      await refreshState();
    } catch (txError) {
      console.error(txError);
      setError("보상금 출금에 실패했습니다. 이미 출금했거나 받을 금액이 없을 수 있습니다.");
    } finally {
      setBusy(false);
    }
  }

  const filteredParticipants = participants.filter((participant) => {
    const keyword = participantSearch.trim().toLowerCase();
    if (!keyword) return true;
    return `${participant.name} ${participant.projectRole} ${participant.normalizedAddress}`.toLowerCase().includes(keyword);
  });

  const filteredCriteria = criteria.filter((criterion) => {
    const keyword = criterionSearch.trim().toLowerCase();
    if (!keyword) return true;
    return `${criterion.title} ${criterion.category} ${criterion.description}`.toLowerCase().includes(keyword);
  });

  function renderProjectWarnings(): JSX.Element | null {
    if (isConnected && isCbtDeployed && isVaultDeployed) return null;
    return (
      <section className="panel warning-panel">
        <h2>로컬 실행 상태 확인</h2>
        <p>Hardhat 노드와 배포 주소가 맞아야 실제 트랜잭션을 실행할 수 있습니다.</p>
        <code>npm run node</code>
        <code>npm run deploy:local</code>
      </section>
    );
  }

  function renderBasic(): JSX.Element {
    return (
      <>
        <section className="summary-grid">
          <article className="summary-card"><p className="card-title">현재 상태</p><strong>{projectStatus}</strong></article>
          <article className="summary-card"><p className="card-title">등록 참여자</p><strong>{participants.length}명</strong></article>
          <article className="summary-card"><p className="card-title">CBT 보유 참여자</p><strong>{rewardEligibleParticipants.length}명</strong></article>
          <article className="summary-card"><p className="card-title">전체 CBT</p><strong>{formatToken(totalSupply, decimals)} CBT</strong></article>
          <article className="summary-card"><p className="card-title">총 보상금</p><strong>{formatEth(rewardDeposited)} ETH</strong></article>
          <article className="summary-card"><p className="card-title">정산 진행률</p><strong>{settlementProgress}%</strong></article>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>전체 CBT 발행량 설정</h2>
              <p>프로젝트에서 사용할 목표 CBT 총량입니다. 기본값은 100 CBT이며, 실제 발행량은 지급 트랜잭션 결과를 기준으로 표시됩니다.</p>
            </div>
          </div>
          <div className="form-grid grant-form">
            <label>
              목표 전체 CBT
              <input
                value={targetCbtSupply}
                onChange={(event) => setTargetCbtSupply(event.target.value)}
                inputMode="numeric"
                placeholder="100"
                disabled={sharesFinalized}
              />
            </label>
            <button type="button" onClick={saveTargetCbtSupply} disabled={sharesFinalized}>
              목표량 저장
            </button>
          </div>
          <div className="metric-strip">
            <div className="metric-item"><span>목표 전체 CBT</span><strong>{targetCbtSupplyValue.toString()} CBT</strong></div>
            <div className="metric-item"><span>현재 발행량</span><strong>{formatToken(totalSupply, decimals)} CBT</strong></div>
            <div className="metric-item"><span>남은 발행 가능량</span><strong>{formatToken(remainingCbtSupplyUnits, decimals)} CBT</strong></div>
          </div>
          {sharesFinalized ? <div className="note">지분이 확정되어 전체 CBT 목표량을 더 이상 변경할 수 없습니다.</div> : null}
        </section>
        <section className="panel">
          <div className="panel-header"><div><h2>현재 가능한 작업</h2><p>메뉴 이동과 별개로 실제 실행 가능 여부는 컨트랙트 상태에 따라 결정됩니다.</p></div></div>
          <ul className="plain-list">{availableActions.map((action) => <li key={action}>{action}</li>)}</ul>
        </section>
      </>
    );
  }

  function renderParticipants(): JSX.Element {
    return (
      <>
        <section className="panel admin-panel">
          <div className="panel-header">
            <div><h2>Hardhat 계정 후보</h2><p>첫 번째 계정은 관리자이고, 나머지는 프로젝트 참여자로 등록할 수 있는 후보입니다.</p></div>
            <button type="button" className="secondary" onClick={() => void refreshState()} disabled={busy}>계정과 잔액 새로고침</button>
          </div>
          {adminAccount ? (
            <div className="admin-card">
              <strong>{adminAccount.name}</strong>
              <p>{adminAccount.normalizedAddress}</p>
              <p>ETH {formatEth(ethBalances[adminAccount.normalizedAddress] ?? 0n)} / owner {owner ? shorten(owner) : "-"}</p>
            </div>
          ) : null}
          <div className="table-wrapper">
            <table>
              <thead><tr><th>후보</th><th>주소</th><th>ETH</th><th>표시 이름</th><th>등록</th></tr></thead>
              <tbody>
                {candidateAccounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.name}<span className="subtle-text">{account.defaultName}</span></td>
                    <td title={account.normalizedAddress}>{shorten(account.normalizedAddress)}</td>
                    <td>{formatEth(ethBalances[account.normalizedAddress] ?? 0n)} ETH</td>
                    <td><input defaultValue={account.name} onBlur={(event) => saveAccountName(account, event.target.value)} /></td>
                    <td><button type="button" onClick={() => addHardhatParticipant(account)} disabled={sharesFinalized}>프로젝트 참여자로 추가</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sharesFinalized ? <div className="note">프로젝트 지분이 확정되어 참여자 추가와 삭제는 비활성화되었습니다.</div> : null}
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2>등록된 프로젝트 참여자</h2><p>이름, 역할, 설명은 지분 확정 이후에도 표시 정보로 수정할 수 있습니다.</p></div></div>
          <input value={participantSearch} onChange={(event) => setParticipantSearch(event.target.value)} placeholder="참여자 이름, 역할, 주소 검색" />
          <div className="table-wrapper">
            <table>
              <thead><tr><th>이름</th><th>역할</th><th>주소</th><th>ETH</th><th>CBT</th><th>관리</th></tr></thead>
              <tbody>
                {filteredParticipants.map((participant) => {
                  const editing = editingParticipantId === participant.id;
                  return (
                    <tr key={participant.id}>
                      <td>{editing ? <input value={editParticipantName} onChange={(event) => setEditParticipantName(event.target.value)} /> : <>{participant.name}<span className="subtle-text">{participant.description}</span></>}</td>
                      <td>{editing ? <input value={editParticipantRole} onChange={(event) => setEditParticipantRole(event.target.value)} /> : participant.projectRole}</td>
                      <td title={participant.normalizedAddress}>{shorten(participant.normalizedAddress)}</td>
                      <td>{formatEth(ethBalances[participant.normalizedAddress] ?? 0n)} ETH</td>
                      <td>{formatToken(balances[participant.normalizedAddress] ?? 0n, decimals)} CBT</td>
                      <td>
                        <div className="row-actions">
                          {editing ? (
                            <>
                              <input value={editParticipantDescription} onChange={(event) => setEditParticipantDescription(event.target.value)} placeholder="설명" />
                              <button type="button" onClick={() => saveParticipantEdit(participant)}>저장</button>
                              <button type="button" className="secondary" onClick={() => setEditingParticipantId("")}>취소</button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="secondary" onClick={() => startParticipantEdit(participant)}>정보 수정</button>
                              <button type="button" className="ghost" onClick={() => void copyAddress(participant.normalizedAddress)}>주소 복사</button>
                              <button type="button" className="danger" onClick={() => deleteParticipant(participant)} disabled={sharesFinalized}>삭제</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2>참여자 직접 등록</h2><p>Hardhat 계정 외부 주소도 프로젝트 참여자로 등록할 수 있습니다.</p></div></div>
          <div className="form-grid participant-form">
            <label>이름<input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="예: A" /></label>
            <label>주소<input value={manualAddress} onChange={(event) => setManualAddress(event.target.value)} placeholder="0x..." /></label>
            <label>역할<input value={manualRole} onChange={(event) => setManualRole(event.target.value)} placeholder="예: 개발" /></label>
            <label>설명<input value={manualDescription} onChange={(event) => setManualDescription(event.target.value)} placeholder="기여 내용" /></label>
            <button type="button" onClick={addManualParticipant} disabled={sharesFinalized}>직접 등록</button>
          </div>
        </section>
      </>
    );
  }

  function renderCriteria(): JSX.Element {
    return (
      <section className="panel workspace-panel">
        <div className="panel-header">
          <div>
            <h2>기여 기준 관리</h2>
            <p>CBT 지급에 사용할 평가 기준과 기본 수량을 한곳에서 관리합니다.</p>
          </div>
          <div className="panel-stat">
            <span>등록 기준</span>
            <strong>{criteria.length}개</strong>
          </div>
        </div>
        <div className="criteria-composer">
          <label>기준명<input value={criterionTitle} onChange={(event) => setCriterionTitle(event.target.value)} placeholder="예: API 구현" /></label>
          <label>분류<input value={criterionCategory} onChange={(event) => setCriterionCategory(event.target.value)} placeholder="개발" /></label>
          <label>기본 CBT<input value={criterionAmount} onChange={(event) => setCriterionAmount(event.target.value)} inputMode="numeric" placeholder="40" /></label>
          <label className="wide-field">설명<input value={criterionDescription} onChange={(event) => setCriterionDescription(event.target.value)} placeholder="기준 설명" /></label>
          <button type="button" onClick={addCriterion} disabled={sharesFinalized}>기준 등록</button>
        </div>
        {sharesFinalized ? <div className="note">지분이 확정되어 기여 기준 등록, 수정, 삭제가 비활성화되었습니다.</div> : null}
        <div className="section-toolbar">
          <input value={criterionSearch} onChange={(event) => setCriterionSearch(event.target.value)} placeholder="기준명, 분류, 설명 검색" />
          <span>{filteredCriteria.length}개 표시</span>
        </div>
        <div className="criteria-grid">
          {filteredCriteria.map((criterion) => {
            const editing = editingCriterionId === criterion.id;
            return (
              <article className="criterion-card" key={criterion.id}>
                {editing ? (
                  <div className="edit-stack">
                    <input value={editCriterionTitle} onChange={(event) => setEditCriterionTitle(event.target.value)} />
                    <input value={editCriterionCategory} onChange={(event) => setEditCriterionCategory(event.target.value)} />
                    <input value={editCriterionAmount} onChange={(event) => setEditCriterionAmount(event.target.value)} />
                    <input value={editCriterionDescription} onChange={(event) => setEditCriterionDescription(event.target.value)} />
                    <div className="row-actions">
                      <button type="button" onClick={() => saveCriterionEdit(criterion)}>저장</button>
                      <button type="button" className="secondary" onClick={() => setEditingCriterionId("")}>취소</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="criterion-card-header">
                      <span>{criterion.category || "미분류"}</span>
                      <strong>{criterion.baseTokenAmount} CBT</strong>
                    </div>
                    <h3>{criterion.title}</h3>
                    <p>{criterion.description || "설명 없음"}</p>
                    <div className="row-actions">
                      <button type="button" className="secondary" onClick={() => startCriterionEdit(criterion)} disabled={sharesFinalized}>수정</button>
                      <button type="button" className="danger" onClick={() => deleteCriterion(criterion)} disabled={sharesFinalized}>삭제</button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderCbtManagement(): JSX.Element {
    const selectedGrantParticipant = participants.find((participant) => participant.id === grantParticipantId) ?? null;
    const selectedRevokeParticipant = participants.find((participant) => participant.id === revokeParticipantId) ?? null;

    return (
      <>
        <section className="panel workspace-panel grant-panel">
          <div className="panel-header">
            <div><h2>CBT 기여도 관리</h2><p>지급과 회수를 분리해서 실수 없이 조정할 수 있게 정리했습니다.</p></div>
            <div className="panel-stat">
              <span>남은 발행 가능량</span>
              <strong>{formatToken(remainingCbtSupplyUnits, decimals)} CBT</strong>
            </div>
          </div>
          <div className="operation-grid">
            <div className="operation-column">
              <div className="operation-heading">
                <h3>CBT 지급</h3>
                <p>기준 수량에 조정값을 더해 최종 지급량을 계산합니다.</p>
              </div>
              <div className="operation-form">
                <label>참여자<select value={grantParticipantId} onChange={(event) => setGrantParticipantId(event.target.value)}><option value="">선택</option>{participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                <label>기여 기준<select value={grantCriterionId} onChange={(event) => setGrantCriterionId(event.target.value)}><option value="">선택</option>{criteria.map((c) => <option key={c.id} value={c.id}>{c.title} / {c.baseTokenAmount} CBT</option>)}</select></label>
                <label>조정 CBT<input value={adjustment} onChange={(event) => setAdjustment(event.target.value)} placeholder="예: -5 또는 10" /></label>
                <label>지급 사유<input value={grantMemo} onChange={(event) => setGrantMemo(event.target.value)} placeholder="기여 내용" /></label>
              </div>
              <div className="selected-card selected-card-strong">
                <span>최종 지급량</span>
                <strong>{finalGrantAmount || 0} CBT</strong>
                <p>{selectedGrantParticipant ? `${selectedGrantParticipant.name}에게 지급 예정` : "참여자를 선택해주세요."}</p>
              </div>
              <button type="button" onClick={() => void grantCbt()} disabled={busy || sharesFinalized || finalGrantAmount <= 0 || wouldExceedTargetSupply}>CBT 지급</button>
            </div>
            <div className="operation-column danger-column">
              <div className="operation-heading">
                <h3>CBT 회수 및 조정</h3>
                <p>오지급된 CBT는 지분 확정 전까지만 회수할 수 있습니다.</p>
              </div>
              <div className="operation-form">
                <label>참여자<select value={revokeParticipantId} onChange={(event) => setRevokeParticipantId(event.target.value)}><option value="">선택</option>{participants.map((p) => <option key={p.id} value={p.id}>{p.name} / {formatToken(balances[p.normalizedAddress] ?? 0n, decimals)} CBT</option>)}</select></label>
                <label>회수 CBT<input value={revokeAmount} onChange={(event) => setRevokeAmount(event.target.value)} inputMode="numeric" placeholder="10" /></label>
                <label className="wide-field">회수 사유<input value={revokeMemo} onChange={(event) => setRevokeMemo(event.target.value)} placeholder="오지급 조정" /></label>
              </div>
              <div className="selected-card">
                <span>현재 보유량</span>
                <strong>{selectedRevokeParticipant ? formatToken(balances[selectedRevokeParticipant.normalizedAddress] ?? 0n, decimals) : "0"} CBT</strong>
                <p>{selectedRevokeParticipant ? `${selectedRevokeParticipant.name}의 회수 전 잔액` : "참여자를 선택해주세요."}</p>
              </div>
              <button type="button" className="danger" onClick={() => void revokeCbt()} disabled={busy || sharesFinalized}>CBT 회수</button>
            </div>
          </div>
          {sharesFinalized ? <div className="note">프로젝트 지분이 확정되어 CBT 수량을 변경할 수 없습니다.</div> : null}
          {!sharesFinalized && wouldExceedTargetSupply ? <div className="note">설정한 전체 CBT 목표량을 초과하는 지급입니다. 기본 구성에서 목표량을 늘리거나 기존 CBT를 회수해주세요.</div> : null}
        </section>
        {renderShareTable("참여자별 CBT 현황")}
      </>
    );
  }

  function renderShareTable(title: string): JSX.Element {
    const sortedParticipants = [...participants].sort((first, second) => {
      const firstBalance = balances[first.normalizedAddress] ?? 0n;
      const secondBalance = balances[second.normalizedAddress] ?? 0n;
      return firstBalance === secondBalance ? first.name.localeCompare(second.name) : firstBalance > secondBalance ? -1 : 1;
    });

    return (
      <section className="panel share-panel">
        <div className="panel-header">
          <div><h2>{title}</h2><p>{sharesFinalized ? "확정된 프로젝트 지분입니다." : "현재 CBT 기준 예상 지분이며 지급과 회수에 따라 바뀔 수 있습니다."}</p></div>
          <span className={sharesFinalized ? "state-pill success" : "state-pill"}>{sharesFinalized ? "확정 완료" : "변동 가능"}</span>
        </div>
        <div className="share-summary">
          <div><span>전체 CBT</span><strong>{formatToken(totalSupply, decimals)} CBT</strong></div>
          <div><span>보유 참여자</span><strong>{rewardEligibleParticipants.length}/{participants.length}명</strong></div>
          <div><span>보상금</span><strong>{formatEth(rewardDeposited)} ETH</strong></div>
        </div>
        <div className="table-wrapper">
          <table className="share-table">
            <thead><tr><th>참여자</th><th>역할</th><th>주소</th><th>CBT</th><th>지분율</th><th>예상 보상</th><th>출금 상태</th></tr></thead>
            <tbody>
              {sortedParticipants.map((participant) => {
                const balance = balances[participant.normalizedAddress] ?? 0n;
                const sharePercent = percent(balance, totalSupply);
                return (
                  <tr key={participant.id}>
                    <td><strong>{participant.name}</strong><span className="subtle-text">{participant.description || participant.source}</span></td>
                    <td>{participant.projectRole}</td>
                    <td title={participant.normalizedAddress}>{shorten(participant.normalizedAddress)}</td>
                    <td>{formatToken(balance, decimals)} CBT</td>
                    <td>
                      <div className="share-meter">
                        <span>{sharePercent}</span>
                        <div><i style={{ width: sharePercent }} /></div>
                      </div>
                    </td>
                    <td>{formatEth(claimables[participant.normalizedAddress] ?? 0n)} ETH</td>
                    <td><span className={claimed[participant.normalizedAddress] ? "state-pill success" : "state-pill muted"}>{claimed[participant.normalizedAddress] ? "출금 완료" : "대기"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderShares(): JSX.Element {
    return (
      <>
        {renderShareTable("프로젝트 지분 현황")}
        <section className="panel finalize-panel">
          <div className="panel-header">
            <div><h2>프로젝트 지분 확정</h2><p>현재 CBT 분배 결과를 최종 지분으로 확정합니다.</p></div>
            <button type="button" onClick={() => void finalizeShares()} disabled={busy || sharesFinalized || totalSupply === 0n}>현재 지분으로 최종 확정</button>
          </div>
          <div className="note">
            {sharesFinalized
              ? "프로젝트 지분이 확정되었습니다. 이후 CBT 수량과 지분 비율은 변경할 수 없습니다."
              : "지분 확정 전에는 CBT 지급 또는 회수에 따라 비율이 변경될 수 있습니다."}
          </div>
        </section>
      </>
    );
  }

  function renderRewards(): JSX.Element {
    return (
      <>
        <section className="panel">
          <div className="panel-header"><div><h2>프로젝트 보상금 관리</h2><p>지분 확정 이후 RewardVault에 ETH 보상금을 예치하고 참여자별 출금을 진행합니다.</p></div></div>
          <div className="form-grid grant-form">
            <label>프로젝트 보상금<input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} placeholder="1" /></label>
            <button type="button" onClick={() => void depositReward()} disabled={busy || !sharesFinalized || rewardDeposited > 0n}>RewardVault에 보상금 예치</button>
          </div>
          {!sharesFinalized ? <div className="note">프로젝트 지분을 먼저 확정해야 보상금을 예치할 수 있습니다.</div> : null}
          {rewardDeposited > 0n ? <div className="note">현재 정책에서는 보상금이 한 번 예치되면 중복 예치를 막습니다.</div> : null}
        </section>
        <section className="summary-grid">
          <article className="summary-card"><p className="card-title">총 보상금</p><strong>{formatEth(rewardDeposited)} ETH</strong></article>
          <article className="summary-card"><p className="card-title">Vault 현재 잔액</p><strong>{formatEth(vaultBalance)} ETH</strong></article>
          <article className="summary-card"><p className="card-title">총 출금액</p><strong>{formatEth(claimedTotal)} ETH</strong></article>
          <article className="summary-card"><p className="card-title">출금 완료 인원</p><strong>{claimedCount}/{rewardEligibleParticipants.length}명</strong></article>
          <article className="summary-card"><p className="card-title">정산 진행률</p><strong>{settlementProgress}%</strong></article>
          <article className="summary-card"><p className="card-title">보상 대상</p><strong>{rewardEligibleParticipants.length}명</strong></article>
        </section>
        <section className="panel">
          <div className="panel-header"><div><h2>참여자별 예상 보상과 출금</h2><p>Hardhat 계정으로 등록된 참여자는 자신의 signer로 직접 출금할 수 있습니다.</p></div></div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>참여자</th><th>CBT</th><th>지분</th><th>예상 보상</th><th>출금액</th><th>signer</th><th>출금</th></tr></thead>
              <tbody>
                {participants.map((participant) => (
                  <tr key={participant.id}>
                    <td>{participant.name}</td>
                    <td>{formatToken(balances[participant.normalizedAddress] ?? 0n, decimals)} CBT</td>
                    <td>{percent(balances[participant.normalizedAddress] ?? 0n, totalSupply)}</td>
                    <td>{formatEth(claimables[participant.normalizedAddress] ?? 0n)} ETH</td>
                    <td>{formatEth(claimedAmounts[participant.normalizedAddress] ?? 0n)} ETH</td>
                    <td>{participant.accountIndex === null ? "수동 주소" : `Hardhat #${participant.accountIndex}`}</td>
                    <td><button type="button" onClick={() => void claimReward(participant)} disabled={busy || participant.accountIndex === null || claimed[participant.normalizedAddress] || (claimables[participant.normalizedAddress] ?? 0n) === 0n}>보상금 출금</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  function renderActivity(): JSX.Element {
    return (
      <section className="panel">
        <div className="panel-header"><div><h2>프로젝트 활동 이력</h2><p>프론트엔드 설정 변경과 블록체인 트랜잭션 기록을 함께 확인합니다.</p></div></div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>시간</th><th>유형</th><th>대상</th><th>수량</th><th>사유</th><th>트랜잭션</th><th>블록</th><th>결과</th></tr></thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td>{item.action}</td>
                  <td>{item.participantName || shorten(item.address || "")}</td>
                  <td>{item.amount || "-"}</td>
                  <td>{item.memo}</td>
                  <td title={item.transactionHash}>{item.transactionHash ? shorten(item.transactionHash) : "블록체인 거래 없음"}</td>
                  <td>{item.blockNumber ?? "-"}</td>
                  <td>{item.success === false ? "실패" : "성공"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderActiveMenu(): JSX.Element {
    if (activeMenu === "basic") return renderBasic();
    if (activeMenu === "participants") return renderParticipants();
    if (activeMenu === "criteria") return renderCriteria();
    if (activeMenu === "cbt") return renderCbtManagement();
    if (activeMenu === "shares") return renderShares();
    if (activeMenu === "rewards") return renderRewards();
    return renderActivity();
  }

  return (
    <div className="app-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">CBT PROJECT</p>
          <h1>{project.name}</h1>
          <p className="hero-copy">{project.description}</p>
          <p className="small-note">상태: {projectStatus} / 관리자: {owner ? shorten(owner) : "-"} / RPC: {RPC_URL} / Chain {chainId || "-"}</p>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary" onClick={() => void refreshState()} disabled={busy}>상태 새로고침</button>
        </div>
      </header>

      <nav className="project-nav" aria-label="프로젝트 메뉴">
        {menus.map((menu) => (
          <button
            key={menu.key}
            type="button"
            className={activeMenu === menu.key ? "active" : "ghost"}
            onClick={() => setActiveMenu(menu.key)}
          >
            {menu.label}
          </button>
        ))}
      </nav>

      {renderProjectWarnings()}
      {error ? <div className="error-message">{error}</div> : null}
      <div className="status-message" aria-live="polite">{status}</div>
      {renderActiveMenu()}
    </div>
  );
}

export default App;
