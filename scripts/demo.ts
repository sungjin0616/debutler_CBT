import { ethers } from "hardhat";

async function main(): Promise<void> {
  const [owner, memberA, memberB, memberC] = await ethers.getSigners();

  console.log("==================================================");
  console.log("ContriSplit 배포 상태 데모");
  console.log("==================================================");
  console.log("관리자:", owner.address);
  console.log("참여자 1:", memberA.address);
  console.log("참여자 2:", memberB.address);
  console.log("참여자 3:", memberC.address);

  const ContributionToken = await ethers.getContractFactory("ContributionToken");
  const contributionToken = await ContributionToken.deploy();
  await contributionToken.waitForDeployment();

  const RewardVault = await ethers.getContractFactory("RewardVault");
  const rewardVault = await RewardVault.deploy(await contributionToken.getAddress());
  await rewardVault.waitForDeployment();

  console.log("\n[1단계] 스마트 컨트랙트 배포");
  console.log("ContributionToken:", await contributionToken.getAddress());
  console.log("RewardVault:", await rewardVault.getAddress());

  const totalSupply = await contributionToken.totalSupply();
  const balanceA = await contributionToken.balanceOf(memberA.address);
  const balanceB = await contributionToken.balanceOf(memberB.address);
  const balanceC = await contributionToken.balanceOf(memberC.address);

  console.log("\n[2단계] 초기 CBT 상태");
  console.log("전체 발행량:", ethers.formatUnits(totalSupply, 18), "CBT");
  console.log("참여자 1 CBT:", ethers.formatUnits(balanceA, 18), "CBT");
  console.log("참여자 2 CBT:", ethers.formatUnits(balanceB, 18), "CBT");
  console.log("참여자 3 CBT:", ethers.formatUnits(balanceC, 18), "CBT");

  console.log("\nCBT는 이 데모 스크립트에서 자동 지급하지 않습니다.");
  console.log("프론트엔드에서 참여자를 선택하고 기여 토큰 지급 버튼을 눌러 직접 지급해 주세요.");
  console.log("==================================================");
}

main().catch((error: unknown) => {
  console.error("ContriSplit 데모 실행 중 오류가 발생했습니다.");
  console.error(error);
  process.exitCode = 1;
});
