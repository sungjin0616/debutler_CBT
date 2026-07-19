// 로컬 Hardhat 네트워크의 상태를 조회하는 프런트엔드 로직이다.
const RPC_URL = "http://127.0.0.1:8545";
const ADDRESS_FILE = "./contract-addresses.json";
const CBT_ABI_FILE = "./abi/CBTToken.json";
const REWARD_ABI_FILE = "./abi/ContributionReward.json";

const errorBox = document.getElementById("errorBox");
const refreshButton = document.getElementById("refreshButton");

function showError(message) {
  // 조회 중 오류가 발생하면 사용자에게 분류된 메시지를 보여준다.
  if (errorBox) {
    errorBox.hidden = false;
    errorBox.textContent = message;
  }
}

function clearError() {
  // 이전 오류를 지워 새 상태를 다시 보여준다.
  if (errorBox) {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

async function loadJson(filePath, description) {
  // JSON 파일을 캐시 대신 항상 새로 읽어 오래된 ABI를 사용하지 않도록 한다.
  const response = await fetch(filePath, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`${description} 파일을 불러오지 못했습니다. HTTP 상태: ${response.status}`);
  }

  return response.json();
}

function extractAbi(artifact, contractName) {
  // ABI 파일이 배열 형태이든 Hardhat artifact 형태이든 모두 안전하게 추출한다.
  if (Array.isArray(artifact)) {
    return artifact.map((item) => (typeof item === "string" ? JSON.parse(item) : item));
  }

  if (artifact && Array.isArray(artifact.abi)) {
    return artifact.abi.map((item) => (typeof item === "string" ? JSON.parse(item) : item));
  }

  throw new Error(`${contractName} ABI 형식이 올바르지 않습니다.`);
}

function validateAbiFunctions(abi, contractName, requiredFunctions) {
  // 프런트엔드에서 실제로 호출할 함수가 ABI에 포함되어 있는지 검사한다.
  const functionNames = new Set(
    abi.filter((item) => item.type === "function").map((item) => item.name)
  );

  const missingFunctions = requiredFunctions.filter((functionName) => !functionNames.has(functionName));

  if (missingFunctions.length > 0) {
    throw new Error(`${contractName} ABI에 필요한 함수가 없습니다: ${missingFunctions.join(", ")}`);
  }
}

function validateAddressData(addressData) {
  // 주소 파일에 필요한 필드가 있는지 확인하고 형식이 올바른지 검사한다.
  const missingFields = [];

  if (!addressData.cbtToken) {
    missingFields.push("cbtToken");
  } else if (!ethers.isAddress(addressData.cbtToken)) {
    throw new Error("CBTToken 주소 형식이 올바르지 않습니다.");
  }

  if (!addressData.contributionReward) {
    missingFields.push("contributionReward");
  } else if (!ethers.isAddress(addressData.contributionReward)) {
    throw new Error("ContributionReward 주소 형식이 올바르지 않습니다.");
  }

  if (missingFields.length > 0) {
    throw new Error(`배포 주소 파일에 필드가 없습니다: ${missingFields.join(", ")}`);
  }

  if (!addressData.members || !addressData.members.a || !addressData.members.b || !addressData.members.c) {
    throw new Error("팀원 주소 정보가 배포 주소 파일에 없습니다.");
  }

  if (!ethers.isAddress(addressData.members.a) || !ethers.isAddress(addressData.members.b) || !ethers.isAddress(addressData.members.c)) {
    throw new Error("팀원 주소 형식이 올바르지 않습니다.");
  }
}

async function loadContracts() {
  clearError();

  try {
    // 상태 조회 순서는 네트워크 연결 → 주소 파일 읽기 → ABI 읽기 → 컨트랙트 코드 확인 → 컨트랙트 호출 순서다.
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();

    setText("rpcStatus", `연결 상태: 연결됨 (${network.name})`);
    setText("blockNumber", `현재 블록 번호: ${blockNumber}`);

    const addressData = await loadJson(ADDRESS_FILE, "배포 주소");
    validateAddressData(addressData);

    setText("cbtAddress", `CBTToken 주소: ${addressData.cbtToken}`);
    setText("rewardAddress", `ContributionReward 주소: ${addressData.contributionReward}`);

    const cbtArtifact = await loadJson(CBT_ABI_FILE, "CBTToken ABI");
    const rewardArtifact = await loadJson(REWARD_ABI_FILE, "ContributionReward ABI");

    const cbtAbi = extractAbi(cbtArtifact, "CBTToken");
    const rewardAbi = extractAbi(rewardArtifact, "ContributionReward");

    validateAbiFunctions(cbtAbi, "CBTToken", ["name", "symbol", "totalSupply", "balanceOf"]);
    validateAbiFunctions(rewardAbi, "ContributionReward", ["getMemberCount", "calculateReward", "distributionCount", "totalRewardReceived"]);

    const cbtToken = new ethers.Contract(addressData.cbtToken, cbtAbi, provider);
    const contributionReward = new ethers.Contract(addressData.contributionReward, rewardAbi, provider);

    const tokenCode = await provider.getCode(addressData.cbtToken);
    const rewardCode = await provider.getCode(addressData.contributionReward);

    if (tokenCode === "0x") {
      throw new Error("CBTToken 주소에 배포된 스마트 컨트랙트 코드가 없습니다. 로컬 노드를 재시작했다면 컨트랙트를 다시 배포해야 합니다.");
    }

    if (rewardCode === "0x") {
      throw new Error("ContributionReward 주소에 배포된 스마트 컨트랙트 코드가 없습니다. 로컬 노드를 재시작했다면 컨트랙트를 다시 배포해야 합니다.");
    }

    // 컨트랙트 호출 전에는 wei와 CBT 단위를 변환하기 위해 값을 읽어온다.
    const tokenName = await cbtToken.name();
    const tokenSymbol = await cbtToken.symbol();
    const totalSupply = await cbtToken.totalSupply();
    const memberA = addressData.members.a;
    const memberB = addressData.members.b;
    const memberC = addressData.members.c;
    const balanceA = await cbtToken.balanceOf(memberA);
    const balanceB = await cbtToken.balanceOf(memberB);
    const balanceC = await cbtToken.balanceOf(memberC);

    const contractBalance = await provider.getBalance(addressData.contributionReward);
    const memberCount = await contributionReward.getMemberCount();
    const rewardA = await contributionReward.calculateReward(memberA);
    const rewardB = await contributionReward.calculateReward(memberB);
    const rewardC = await contributionReward.calculateReward(memberC);
    const distributionCount = await contributionReward.distributionCount();

    setText("tokenName", `토큰 이름: ${tokenName}`);
    setText("tokenSymbol", `토큰 심볼: ${tokenSymbol}`);
    setText("totalSupply", `총 발행량: ${ethers.formatUnits(totalSupply, 18)} CBT`);
    setText("memberA", `A: ${ethers.formatUnits(balanceA, 18)} CBT (${memberA})`);
    setText("memberB", `B: ${ethers.formatUnits(balanceB, 18)} CBT (${memberB})`);
    setText("memberC", `C: ${ethers.formatUnits(balanceC, 18)} CBT (${memberC})`);
    setText("contractBalance", `보상 컨트랙트 ETH 잔액: ${ethers.formatEther(contractBalance)} ETH`);
    setText("memberCount", `등록된 팀원 수: ${memberCount.toString()}`);
    setText("rewardA", `A 예상 보상: ${ethers.formatEther(rewardA)} ETH`);
    setText("rewardB", `B 예상 보상: ${ethers.formatEther(rewardB)} ETH`);
    setText("rewardC", `C 예상 보상: ${ethers.formatEther(rewardC)} ETH`);
    setText("distributionCount", `누적 분배 횟수: ${distributionCount.toString()}`);
  } catch (error) {
    // 네트워크 연결 실패나 ABI 오류, 배포 주소 문제를 사용자에게 분명히 표시한다.
    console.error(error);

    if (error.message.includes("ECONNREFUSED") || error.message.includes("fetch")) {
      showError("localhost 네트워크 연결 실패: Hardhat 노드가 실행 중인지 확인해 주세요.");
    } else if (error.message.includes("배포 주소") || error.message.includes("필드가 없습니다") || error.message.includes("형식이 올바르지")) {
      showError(`배포 주소 파일 문제: ${error.message}`);
    } else if (error.message.includes("ABI")) {
      showError(`ABI 문제: ${error.message}`);
    } else {
      showError(`스마트 컨트랙트 호출 실패: ${error.message}`);
    }
  }
}

refreshButton.addEventListener("click", loadContracts);
window.addEventListener("DOMContentLoaded", loadContracts);
