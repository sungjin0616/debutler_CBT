import { ethers } from "hardhat";

/**
 * ContriSplit의 전체 흐름을 발표용으로 보여주기 위한 데모 스크립트다.
 * 컨트랙트 배포부터 CBT 지급, 지분 확정, 보상금 입금과 출금까지 한 번에 실행한다.
 */
async function main(): Promise<void> {
  // 데모에 사용할 관리자와 팀원 계정을 가져온다.
  const [owner, memberA, memberB, memberC] = await ethers.getSigners();

  console.log("==================================================");
  console.log("ContriSplit 스마트 컨트랙트 데모");
  console.log("==================================================");
  console.log("\n[1단계] 테스트 계정 확인");
  console.log("관리자:", owner.address);
  console.log("A 팀원:", memberA.address);
  console.log("B 팀원:", memberB.address);
  console.log("C 팀원:", memberC.address);

  // ContributionToken과 RewardVault를 배포한다.
  const ContributionToken = await ethers.getContractFactory("ContributionToken");
  const contributionToken = await ContributionToken.deploy();
  await contributionToken.waitForDeployment();

  const RewardVault = await ethers.getContractFactory("RewardVault");
  const rewardVault = await RewardVault.deploy(await contributionToken.getAddress());
  await rewardVault.waitForDeployment();

  console.log("\n[2단계] 스마트 컨트랙트 배포");
  console.log("ContributionToken:", await contributionToken.getAddress());
  console.log("RewardVault:", await rewardVault.getAddress());

  // A, B, C에게 CBT를 지급한다.
  await (await contributionToken.connect(owner).mint(memberA.address, 50n)).wait();
  await (await contributionToken.connect(owner).mint(memberB.address, 30n)).wait();
  await (await contributionToken.connect(owner).mint(memberC.address, 20n)).wait();

  console.log("\n[3단계] CBT 기여 토큰 지급");
  console.log("A:", 50n, "CBT");
  console.log("B:", 30n, "CBT");
  console.log("C:", 20n, "CBT");
  console.log("전체 발행량:", await contributionToken.totalSupply(), "CBT");

  // 지분 비율은 개인 CBT × 100 ÷ 전체 CBT로 계산한다.
  const totalSupply = await contributionToken.totalSupply();
  const shareA = (await contributionToken.balanceOf(memberA.address) * 100n) / totalSupply;
  const shareB = (await contributionToken.balanceOf(memberB.address) * 100n) / totalSupply;
  const shareC = (await contributionToken.balanceOf(memberC.address) * 100n) / totalSupply;

  console.log("\n[4단계] 기여 지분 확인");
  console.log("A:", shareA.toString(), "%");
  console.log("B:", shareB.toString(), "%");
  console.log("C:", shareC.toString(), "%");

  // 지분 확정 상태를 변경한다.
  await (await contributionToken.connect(owner).finalize()).wait();
  console.log("\n[5단계] 프로젝트 지분 확정");
  console.log("지분 확정 상태:", await contributionToken.finalized());

  // 관리자가 RewardVault에 1 ETH 보상금을 입금한다.
  await (await rewardVault.connect(owner).depositReward({ value: ethers.parseEther("1") })).wait();
  console.log("\n[6단계] 프로젝트 보상금 입금");
  console.log("입금액: 1 ETH");
  console.log("누적 보상금:", ethers.formatEther(await rewardVault.totalRewardDeposited()), "ETH");
  console.log("Vault 잔액:", ethers.formatEther(await rewardVault.vaultBalance()), "ETH");

  // 팀원별 보상 권리와 출금 가능 금액을 출력한다.
  console.log("\n[7단계] 팀원별 출금 가능 보상금");
  console.log("A:", ethers.formatEther(await rewardVault.claimable(memberA.address)), "ETH");
  console.log("B:", ethers.formatEther(await rewardVault.claimable(memberB.address)), "ETH");
  console.log("C:", ethers.formatEther(await rewardVault.claimable(memberC.address)), "ETH");

  // 각 팀원이 자신의 보상금을 직접 출금한다.
  await (await rewardVault.connect(memberA).claimReward()).wait();
  await (await rewardVault.connect(memberB).claimReward()).wait();
  await (await rewardVault.connect(memberC).claimReward()).wait();

  console.log("\n[8단계] 팀원별 보상금 출금");
  console.log("A 수령 완료:", ethers.formatEther(await rewardVault.claimedAmount(memberA.address)), "ETH");
  console.log("B 수령 완료:", ethers.formatEther(await rewardVault.claimedAmount(memberB.address)), "ETH");
  console.log("C 수령 완료:", ethers.formatEther(await rewardVault.claimedAmount(memberC.address)), "ETH");

  console.log("\n[9단계] 최종 상태");
  console.log("A 남은 출금 가능 금액:", ethers.formatEther(await rewardVault.claimable(memberA.address)), "ETH");
  console.log("B 남은 출금 가능 금액:", ethers.formatEther(await rewardVault.claimable(memberB.address)), "ETH");
  console.log("C 남은 출금 가능 금액:", ethers.formatEther(await rewardVault.claimable(memberC.address)), "ETH");
  console.log("Vault 최종 잔액:", ethers.formatEther(await rewardVault.vaultBalance()), "ETH");

  console.log("\n==================================================");
  console.log("ContriSplit 데모 완료");
  console.log("==================================================");
}

main().catch((error: unknown) => {
  // 데모 중 오류가 발생하면 원인을 출력하고 실패 코드로 종료한다.
  console.error("ContriSplit 데모 실행 중 오류가 발생했습니다.");
  console.error(error);
  process.exitCode = 1;
});
