import fs from "fs";
import path from "path";
import { ethers } from "hardhat";

/**
 * 로컬 Hardhat 네트워크에서 CBT 발행부터 ETH 보상 분배까지 전체 흐름을 한 번에 실행한다.
 * MetaMask 대신 로컬 계정으로 트랜잭션을 보내고, 콘솔에서 결과를 확인할 수 있게 만든다.
 */
async function main(): Promise<void> {
  try {
    // 로컬 노드의 계정 역할을 정리한다.
    const [admin, memberA, memberB, memberC] = await ethers.getSigners();

    // 배포 시 저장한 주소 파일을 읽어 컨트랙트 주소를 가져온다.
    const addressFilePath = path.resolve(__dirname, "../frontend/contract-addresses.json");
    const addressData = JSON.parse(fs.readFileSync(addressFilePath, "utf8"));

    const cbtTokenAddress = addressData.cbtToken;
    const rewardAddress = addressData.contributionReward;

    // 배포된 컨트랙트를 연결한다.
    const CBTToken = await ethers.getContractFactory("CBTToken");
    const cbtToken = CBTToken.attach(cbtTokenAddress);

    const ContributionReward = await ethers.getContractFactory("ContributionReward");
    const contributionReward = ContributionReward.attach(rewardAddress);

    console.log("==================================================");
    console.log("로컬 CBT 보상 분배 데모");
    console.log("==================================================");
    console.log("관리자 주소:", admin.address);
    console.log("A 팀원 주소:", memberA.address);
    console.log("B 팀원 주소:", memberB.address);
    console.log("C 팀원 주소:", memberC.address);

    // 초기 상태를 조회해 현재 CBT와 보상 컨트랙트 잔액을 확인한다.
    const totalSupply = await cbtToken.totalSupply();
    const balanceA = await cbtToken.balanceOf(memberA.address);
    const balanceB = await cbtToken.balanceOf(memberB.address);
    const balanceC = await cbtToken.balanceOf(memberC.address);
    const contractBalanceBefore = await ethers.provider.getBalance(rewardAddress);

    console.log("\n[1단계] 초기 상태");
    console.log("CBT 총 발행량:", ethers.formatUnits(totalSupply, 18));
    console.log("A CBT 잔액:", ethers.formatUnits(balanceA, 18));
    console.log("B CBT 잔액:", ethers.formatUnits(balanceB, 18));
    console.log("C CBT 잔액:", ethers.formatUnits(balanceC, 18));
    console.log("보상 컨트랙트 ETH 잔액:", ethers.formatEther(contractBalanceBefore), "ETH");

    // 관리자 계정에서 보상 컨트랙트로 10 ETH를 입금한다.
    const depositAmount = ethers.parseEther("10");
    console.log("\n[2단계] 보상금 입금");
    const depositTx = await contributionReward.connect(admin).depositReward({ value: depositAmount });
    await depositTx.wait();
    console.log("입금 완료:", ethers.formatEther(depositAmount), "ETH");

    // 예상 보상은 50:30:20 비율대로 계산되므로 10 ETH 기준으로 5, 3, 2 ETH가 된다.
    const expectedA = ethers.parseEther("5");
    const expectedB = ethers.parseEther("3");
    const expectedC = ethers.parseEther("2");

    console.log("\n[3단계] 예상 보상");
    console.log("A 예상 보상:", ethers.formatEther(expectedA), "ETH");
    console.log("B 예상 보상:", ethers.formatEther(expectedB), "ETH");
    console.log("C 예상 보상:", ethers.formatEther(expectedC), "ETH");

    // 분배 전 각 계정의 ETH 잔액을 저장해 실제 지급액을 비교한다.
    const balanceBeforeA = await ethers.provider.getBalance(memberA.address);
    const balanceBeforeB = await ethers.provider.getBalance(memberB.address);
    const balanceBeforeC = await ethers.provider.getBalance(memberC.address);

    console.log("\n[4단계] 보상 분배");
    const distributeTx = await contributionReward.connect(admin).distributeReward();
    await distributeTx.wait();

    // 분배 후 잔액 차이를 계산해 실제 지급액을 확인한다.
    const balanceAfterA = await ethers.provider.getBalance(memberA.address);
    const balanceAfterB = await ethers.provider.getBalance(memberB.address);
    const balanceAfterC = await ethers.provider.getBalance(memberC.address);

    const actualA = balanceAfterA - balanceBeforeA;
    const actualB = balanceAfterB - balanceBeforeB;
    const actualC = balanceAfterC - balanceBeforeC;

    console.log("A 실제 지급액:", ethers.formatEther(actualA), "ETH");
    console.log("B 실제 지급액:", ethers.formatEther(actualB), "ETH");
    console.log("C 실제 지급액:", ethers.formatEther(actualC), "ETH");

    // 최종 상태를 출력한다.
    const contractBalanceAfter = await ethers.provider.getBalance(rewardAddress);
    const distributionCount = await contributionReward.distributionCount();
    const totalRewardA = await contributionReward.totalRewardReceived(memberA.address);
    const totalRewardB = await contributionReward.totalRewardReceived(memberB.address);
    const totalRewardC = await contributionReward.totalRewardReceived(memberC.address);

    console.log("\n[5단계] 최종 상태");
    console.log("보상 컨트랙트 잔액:", ethers.formatEther(contractBalanceAfter), "ETH");
    console.log("누적 분배 횟수:", distributionCount.toString());
    console.log("A 누적 보상:", ethers.formatEther(totalRewardA), "ETH");
    console.log("B 누적 보상:", ethers.formatEther(totalRewardB), "ETH");
    console.log("C 누적 보상:", ethers.formatEther(totalRewardC), "ETH");

    // 실제 지급액이 예상값과 일치하는지 확인한다.
    const matches =
      actualA === expectedA &&
      actualB === expectedB &&
      actualC === expectedC &&
      contractBalanceAfter === 0n;

    if (!matches) {
      throw new Error("보상 분배 결과가 예상값과 다릅니다.");
    }

    console.log("\n로컬 CBT 보상 분배 테스트 성공");
    console.log("==================================================");
  } catch (error) {
    // 실행 단계에서 문제가 생기면 원인을 출력해 어디서 실패했는지 확인할 수 있게 한다.
    console.error("로컬 데모 실행 중 오류가 발생했습니다.");
    console.error(error);
    process.exitCode = 1;
  }
}

main();
