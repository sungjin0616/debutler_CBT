import { ethers } from "hardhat";

/**
 * ContributionToken과 RewardVault를 로컬 Hardhat 네트워크에 배포하기 위한 스크립트다.
 * 배포한 컨트랙트의 주소와 연결된 토큰 주소를 출력해 로컬 검증에 사용한다.
 */
async function main(): Promise<void> {
  // 배포할 관리자 계정을 가져온다.
  const [deployer] = await ethers.getSigners();

  console.log("=== ContriSplit 컨트랙트 배포 시작 ===");
  console.log("배포 관리자:", deployer.address);

  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  console.log("관리자 잔액:", ethers.formatEther(deployerBalance), "ETH");

  // CBT 기여 토큰 컨트랙트를 먼저 배포한다.
  const ContributionToken = await ethers.getContractFactory("ContributionToken");
  const contributionToken = await ContributionToken.deploy();
  await contributionToken.waitForDeployment();

  const tokenAddress = await contributionToken.getAddress();
  console.log("ContributionToken 주소:", tokenAddress);

  // RewardVault가 CBT 정보를 조회할 수 있도록 배포된 토큰 주소를 생성자에 전달한다.
  const RewardVault = await ethers.getContractFactory("RewardVault");
  const rewardVault = await RewardVault.deploy(tokenAddress);
  await rewardVault.waitForDeployment();

  const vaultAddress = await rewardVault.getAddress();
  console.log("RewardVault 주소:", vaultAddress);
  console.log("RewardVault에 연결된 CBT 주소:", await rewardVault.contributionToken());

  console.log("=== ContriSplit 컨트랙트 배포 완료 ===");
}

main().catch((error: unknown) => {
  // 배포 중 오류가 발생하면 원인을 출력하고 실패 코드로 종료한다.
  console.error("컨트랙트 배포 중 오류가 발생했습니다.");
  console.error(error);
  process.exitCode = 1;
});
