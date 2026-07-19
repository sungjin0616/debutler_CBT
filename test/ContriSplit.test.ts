import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * ContriSplit 스마트 컨트랙트의 주요 동작을 검증하기 위한 테스트 파일이다.
 * 배포, CBT 지급, 지분 확정, 보상금 입금과 출금을 모두 확인한다.
 */
describe("ContriSplit", function () {
  async function deployContracts() {
    // 테스트마다 독립된 상태를 유지하기 위해 새 컨트랙트를 배포한다.
    const [owner, memberA, memberB, memberC, outsider] = await ethers.getSigners();

    const ContributionToken = await ethers.getContractFactory("ContributionToken");
    const contributionToken = await ContributionToken.deploy();
    await contributionToken.waitForDeployment();

    const RewardVault = await ethers.getContractFactory("RewardVault");
    const rewardVault = await RewardVault.deploy(await contributionToken.getAddress());
    await rewardVault.waitForDeployment();

    return { owner, memberA, memberB, memberC, outsider, contributionToken, rewardVault };
  }

  describe("컨트랙트 배포", function () {
    it("토큰과 보상 vault가 올바르게 배포되고 초기 상태를 가진다", async function () {
      const { owner, contributionToken, rewardVault } = await deployContracts();

      expect(await contributionToken.owner()).to.equal(owner.address);
      expect(await rewardVault.owner()).to.equal(owner.address);
      expect(await rewardVault.contributionToken()).to.equal(await contributionToken.getAddress());
      expect(await contributionToken.finalized()).to.equal(false);
      expect(await contributionToken.name()).to.equal("Contribution Based Token");
      expect(await contributionToken.symbol()).to.equal("CBT");
      expect(await contributionToken.decimals()).to.equal(18);
    });
  });

  describe("CBT 기여 토큰", function () {
    it("관리자가 A, B, C에게 CBT를 지급하고 총 발행량을 확인한다", async function () {
      const { owner, memberA, memberB, memberC, contributionToken } = await deployContracts();

      await (await contributionToken.connect(owner).mint(memberA.address, 50n)).wait();
      await (await contributionToken.connect(owner).mint(memberB.address, 30n)).wait();
      await (await contributionToken.connect(owner).mint(memberC.address, 20n)).wait();

      expect(await contributionToken.balanceOf(memberA.address)).to.equal(50n);
      expect(await contributionToken.balanceOf(memberB.address)).to.equal(30n);
      expect(await contributionToken.balanceOf(memberC.address)).to.equal(20n);
      expect(await contributionToken.totalSupply()).to.equal(100n);
    });

    it("관리자가 아닌 사용자는 mint를 실행할 수 없다", async function () {
      const { memberA, memberB, contributionToken } = await deployContracts();

      await expect(
        contributionToken.connect(memberA).mint(memberB.address, 10n)
      ).to.be.reverted;
    });

    it("관리자가 잘못 지급한 CBT를 회수할 수 있다", async function () {
      const { owner, memberA, contributionToken } = await deployContracts();

      await (await contributionToken.connect(owner).mint(memberA.address, 60n)).wait();
      await (await contributionToken.connect(owner).burnFrom(memberA.address, 10n)).wait();

      expect(await contributionToken.balanceOf(memberA.address)).to.equal(50n);
      expect(await contributionToken.totalSupply()).to.equal(50n);
    });

    it("일반 사용자의 transfer와 transferFrom은 차단된다", async function () {
      const { owner, memberA, memberB, outsider, contributionToken } = await deployContracts();

      await (await contributionToken.connect(owner).mint(memberA.address, 50n)).wait();

      await expect(
        contributionToken.connect(memberA).transfer(memberB.address, 10n)
      ).to.be.revertedWithCustomError(contributionToken, "UserTransferNotAllowed");

      await expect(
        contributionToken.connect(memberA).approve(outsider.address, 10n)
      ).to.be.revertedWithCustomError(contributionToken, "UserTransferNotAllowed");

      await expect(
        contributionToken.connect(outsider).transferFrom(memberA.address, memberB.address, 10n)
      ).to.be.revertedWithCustomError(contributionToken, "UserTransferNotAllowed");
    });
  });

  describe("프로젝트 지분 확정", function () {
    it("정상적으로 finalize되면 상태가 변경되고 이벤트가 발생한다", async function () {
      const { owner, memberA, memberB, memberC, contributionToken } = await deployContracts();

      await (await contributionToken.connect(owner).mint(memberA.address, 50n)).wait();
      await (await contributionToken.connect(owner).mint(memberB.address, 30n)).wait();
      await (await contributionToken.connect(owner).mint(memberC.address, 20n)).wait();

      await expect(contributionToken.connect(owner).finalize())
        .to.emit(contributionToken, "ProjectFinalized")
        .withArgs(100n);

      expect(await contributionToken.finalized()).to.equal(true);
    });

    it("CBT가 없으면 finalize를 실행할 수 없다", async function () {
      const { owner, contributionToken } = await deployContracts();

      await expect(contributionToken.connect(owner).finalize()).to.be.revertedWithCustomError(
        contributionToken,
        "CannotFinalizeWithoutSupply"
      );
    });

    it("확정 후에는 mint, burnFrom, finalize가 모두 차단된다", async function () {
      const { owner, memberA, contributionToken } = await deployContracts();

      await (await contributionToken.connect(owner).mint(memberA.address, 50n)).wait();
      await (await contributionToken.connect(owner).finalize()).wait();

      await expect(contributionToken.connect(owner).mint(memberA.address, 10n)).to.be.revertedWithCustomError(
        contributionToken,
        "ProjectAlreadyFinalized"
      );
      await expect(contributionToken.connect(owner).burnFrom(memberA.address, 5n)).to.be.revertedWithCustomError(
        contributionToken,
        "ProjectAlreadyFinalized"
      );
      await expect(contributionToken.connect(owner).finalize()).to.be.revertedWithCustomError(
        contributionToken,
        "ProjectAlreadyFinalized"
      );
    });
  });

  describe("보상금 입금 및 계산", function () {
    it("확정 전에는 보상금 입금이 차단된다", async function () {
      const { owner, contributionToken, rewardVault } = await deployContracts();

      await (await contributionToken.connect(owner).mint(owner.address, 100n)).wait();

      await expect(
        rewardVault.connect(owner).depositReward({ value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(rewardVault, "ProjectNotFinalized");
    });

    it("일반 사용자는 보상금 입금을 실행할 수 없다", async function () {
      const { owner, memberA, contributionToken, rewardVault } = await deployContracts();

      await (await contributionToken.connect(owner).mint(memberA.address, 100n)).wait();
      await (await contributionToken.connect(owner).finalize()).wait();

      await expect(
        rewardVault.connect(memberA).depositReward({ value: ethers.parseEther("1") })
      ).to.be.reverted;
    });

    it("0 ETH 입금은 거부되고 정상 입금 시 누적 보상금과 이벤트가 기록된다", async function () {
      const { owner, memberA, memberB, memberC, contributionToken, rewardVault } = await deployContracts();

      await (await contributionToken.connect(owner).mint(memberA.address, 50n)).wait();
      await (await contributionToken.connect(owner).mint(memberB.address, 30n)).wait();
      await (await contributionToken.connect(owner).mint(memberC.address, 20n)).wait();
      await (await contributionToken.connect(owner).finalize()).wait();

      await expect(
        rewardVault.connect(owner).depositReward({ value: 0n })
      ).to.be.revertedWithCustomError(rewardVault, "InvalidDepositAmount");

      await expect(
        rewardVault.connect(owner).depositReward({ value: ethers.parseEther("1") })
      )
        .to.emit(rewardVault, "RewardDeposited")
        .withArgs(owner.address, ethers.parseEther("1"), ethers.parseEther("1"));

      expect(await rewardVault.totalRewardDeposited()).to.equal(ethers.parseEther("1"));
      expect(await rewardVault.vaultBalance()).to.equal(ethers.parseEther("1"));
    });

    it("팀원별 보상 권리를 0.5:0.3:0.2로 계산한다", async function () {
      const { owner, memberA, memberB, memberC, outsider, contributionToken, rewardVault } = await deployContracts();

      await (await contributionToken.connect(owner).mint(memberA.address, 50n)).wait();
      await (await contributionToken.connect(owner).mint(memberB.address, 30n)).wait();
      await (await contributionToken.connect(owner).mint(memberC.address, 20n)).wait();
      await (await contributionToken.connect(owner).finalize()).wait();
      await (await rewardVault.connect(owner).depositReward({ value: ethers.parseEther("1") })).wait();

      expect(await rewardVault.totalEntitlement(memberA.address)).to.equal(ethers.parseEther("0.5"));
      expect(await rewardVault.totalEntitlement(memberB.address)).to.equal(ethers.parseEther("0.3"));
      expect(await rewardVault.totalEntitlement(memberC.address)).to.equal(ethers.parseEther("0.2"));
      expect(await rewardVault.totalEntitlement(outsider.address)).to.equal(0n);
      expect(await rewardVault.claimable(memberA.address)).to.equal(ethers.parseEther("0.5"));
      expect(await rewardVault.claimable(memberB.address)).to.equal(ethers.parseEther("0.3"));
      expect(await rewardVault.claimable(memberC.address)).to.equal(ethers.parseEther("0.2"));
      expect(await rewardVault.claimable(outsider.address)).to.equal(0n);
    });
  });

  describe("보상금 출금", function () {
    it("각 팀원이 자신의 보상금을 정상적으로 출금하고 중복 출금은 차단된다", async function () {
      const { owner, memberA, memberB, memberC, outsider, contributionToken, rewardVault } = await deployContracts();

      await (await contributionToken.connect(owner).mint(memberA.address, 50n)).wait();
      await (await contributionToken.connect(owner).mint(memberB.address, 30n)).wait();
      await (await contributionToken.connect(owner).mint(memberC.address, 20n)).wait();
      await (await contributionToken.connect(owner).finalize()).wait();
      await (await rewardVault.connect(owner).depositReward({ value: ethers.parseEther("1") })).wait();

      await expect(
        rewardVault.connect(memberA).claimReward()
      ).to.changeEtherBalances([rewardVault, memberA], [-(ethers.parseEther("0.5")), ethers.parseEther("0.5")]);

      await expect(rewardVault.connect(memberA).claimReward()).to.be.revertedWithCustomError(rewardVault, "RewardAlreadyClaimed");

      await expect(rewardVault.connect(outsider).claimReward()).to.be.revertedWithCustomError(rewardVault, "NoRewardAvailable");

      await (await rewardVault.connect(memberB).claimReward()).wait();
      await (await rewardVault.connect(memberC).claimReward()).wait();

      expect(await rewardVault.claimedAmount(memberA.address)).to.equal(ethers.parseEther("0.5"));
      expect(await rewardVault.claimedAmount(memberB.address)).to.equal(ethers.parseEther("0.3"));
      expect(await rewardVault.claimedAmount(memberC.address)).to.equal(ethers.parseEther("0.2"));
      expect(await rewardVault.claimable(memberA.address)).to.equal(0n);
      expect(await rewardVault.claimable(memberB.address)).to.equal(0n);
      expect(await rewardVault.claimable(memberC.address)).to.equal(0n);
      expect(await rewardVault.vaultBalance()).to.equal(0n);
    });

    it("추가 입금 후에는 추가 출금 가능 금액이 남는다", async function () {
      const { owner, memberA, contributionToken, rewardVault } = await deployContracts();

      await (await contributionToken.connect(owner).mint(memberA.address, 100n)).wait();
      await (await contributionToken.connect(owner).finalize()).wait();
      await (await rewardVault.connect(owner).depositReward({ value: ethers.parseEther("1") })).wait();

      await expect(
        rewardVault.connect(owner).depositReward({ value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(rewardVault, "RewardAlreadyDeposited");

      expect(await rewardVault.totalRewardDeposited()).to.equal(ethers.parseEther("1"));
      expect(await rewardVault.totalEntitlement(memberA.address)).to.equal(ethers.parseEther("1"));
      expect(await rewardVault.claimable(memberA.address)).to.equal(ethers.parseEther("1"));
    });
  });
});
