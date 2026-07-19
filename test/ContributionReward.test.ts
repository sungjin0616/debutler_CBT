import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * ContributionReward 컨트랙트가 등록, 입금, 보상 계산, 분배 기능을 로컬에서 자동으로 검증한다.
 */
describe("ContributionReward", function () {
  let owner: any;
  let memberA: any;
  let memberB: any;
  let memberC: any;
  let outsider: any;
  let cbtToken: any;
  let rewardVault: any;

  beforeEach(async function () {
    // 테스트마다 새로 배포된 토큰과 보상 컨트랙트를 사용해 상태 간섭이 없도록 만든다.
    [owner, memberA, memberB, memberC, outsider] = await ethers.getSigners();

    const CBTToken = await ethers.getContractFactory("CBTToken");
    cbtToken = await CBTToken.deploy();
    await cbtToken.waitForDeployment();

    const ContributionReward = await ethers.getContractFactory("ContributionReward");
    rewardVault = await ContributionReward.deploy(await cbtToken.getAddress());
    await rewardVault.waitForDeployment();

    // 로컬 테스트용 기본 기여도 토큰을 팀원들에게 분배한다.
    await rewardVault.connect(owner).addMembers([memberA.address, memberB.address, memberC.address]);
    await (await cbtToken.connect(owner).mint(memberA.address, ethers.parseUnits("50", 18))).wait();
    await (await cbtToken.connect(owner).mint(memberB.address, ethers.parseUnits("30", 18))).wait();
    await (await cbtToken.connect(owner).mint(memberC.address, ethers.parseUnits("20", 18))).wait();
  });

  it("owner가 팀원을 등록할 수 있고 등록 수를 확인한다", async function () {
    expect(await rewardVault.getMemberCount()).to.equal(3n);
    expect(await rewardVault.getMembers()).to.deep.equal([memberA.address, memberB.address, memberC.address]);
  });

  it("일반 사용자는 팀원을 등록할 수 없고 0 주소와 중복 등록은 실패한다", async function () {
    await expect(rewardVault.connect(memberA).addMember(memberA.address)).to.be.reverted;
    await expect(rewardVault.connect(owner).addMember(ethers.ZeroAddress)).to.be.revertedWithCustomError(rewardVault, "InvalidMemberAddress");
    await expect(rewardVault.connect(owner).addMember(memberA.address)).to.be.revertedWithCustomError(rewardVault, "MemberAlreadyRegistered");
  });

  it("입금이 가능하고 이벤트와 잔액이 올바르게 기록된다", async function () {
    const depositAmount = ethers.parseEther("10");

    await expect(rewardVault.connect(owner).depositReward({ value: depositAmount }))
      .to.emit(rewardVault, "RewardDeposited")
      .withArgs(owner.address, depositAmount);

    expect(await rewardVault.getContractBalance()).to.equal(depositAmount);

    await expect(rewardVault.connect(owner).depositReward({ value: 0n })).to.be.revertedWithCustomError(rewardVault, "NoRewardAvailable");
  });

  it("예상 보상 계산이 CBT 비율에 맞게 반영된다", async function () {
    await rewardVault.connect(owner).depositReward({ value: ethers.parseEther("10") });

    expect(await rewardVault.calculateReward(memberA.address)).to.equal(ethers.parseEther("5"));
    expect(await rewardVault.calculateReward(memberB.address)).to.equal(ethers.parseEther("3"));
    expect(await rewardVault.calculateReward(memberC.address)).to.equal(ethers.parseEther("2"));
  });

  it("분배 시 각 팀원에게 정확한 ETH가 지급되고 컨트랙트 잔액이 0이 된다", async function () {
    const depositAmount = ethers.parseEther("10");
    const balanceBeforeA = await ethers.provider.getBalance(memberA.address);
    const balanceBeforeB = await ethers.provider.getBalance(memberB.address);
    const balanceBeforeC = await ethers.provider.getBalance(memberC.address);

    await rewardVault.connect(owner).depositReward({ value: depositAmount });
    await rewardVault.connect(owner).distributeReward();

    const balanceAfterA = await ethers.provider.getBalance(memberA.address);
    const balanceAfterB = await ethers.provider.getBalance(memberB.address);
    const balanceAfterC = await ethers.provider.getBalance(memberC.address);

    expect(balanceAfterA - balanceBeforeA).to.equal(ethers.parseEther("5"));
    expect(balanceAfterB - balanceBeforeB).to.equal(ethers.parseEther("3"));
    expect(balanceAfterC - balanceBeforeC).to.equal(ethers.parseEther("2"));
    expect(await rewardVault.getContractBalance()).to.equal(0n);
    expect(await rewardVault.totalRewardReceived(memberA.address)).to.equal(ethers.parseEther("5"));
    expect(await rewardVault.totalRewardReceived(memberB.address)).to.equal(ethers.parseEther("3"));
    expect(await rewardVault.totalRewardReceived(memberC.address)).to.equal(ethers.parseEther("2"));
    expect(await rewardVault.distributionCount()).to.equal(1n);
  });

  it("컨트랙트 잔액이 0이거나 CBT 총 발행량이 0이거나 팀원이 없으면 분배가 실패한다", async function () {
    await expect(rewardVault.connect(owner).distributeReward()).to.be.revertedWithCustomError(rewardVault, "NoRewardAvailable");

    const freshRewardVault = await (await ethers.getContractFactory("ContributionReward")).deploy(await cbtToken.getAddress());
    await freshRewardVault.waitForDeployment();
    await freshRewardVault.connect(owner).addMember(memberA.address);

    await expect(freshRewardVault.connect(owner).distributeReward()).to.be.revertedWithCustomError(freshRewardVault, "NoRewardAvailable");

    await expect(rewardVault.connect(memberA).distributeReward()).to.be.reverted;
  });

  it("반복 분배 시 누적 보상 금액과 분배 횟수가 정확하게 증가한다", async function () {
    await rewardVault.connect(owner).depositReward({ value: ethers.parseEther("10") });
    await rewardVault.connect(owner).distributeReward();

    await rewardVault.connect(owner).depositReward({ value: ethers.parseEther("5") });
    await rewardVault.connect(owner).distributeReward();

    expect(await rewardVault.totalRewardReceived(memberA.address)).to.equal(ethers.parseEther("7.5"));
    expect(await rewardVault.totalRewardReceived(memberB.address)).to.equal(ethers.parseEther("4.5"));
    expect(await rewardVault.totalRewardReceived(memberC.address)).to.equal(ethers.parseEther("3"));
    expect(await rewardVault.distributionCount()).to.equal(2n);
  });
});
