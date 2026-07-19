import { expect } from "chai";
import { ethers } from "hardhat";

describe("CBTToken", function () {
  let owner: any;
  let memberA: any;
  let memberB: any;
  let outsider: any;
  let cbtToken: any;

  beforeEach(async function () {
    // 각 테스트는 새 컨트랙트 배포 상태에서 시작해 초기 발행량이 0인지 보장한다.
    [owner, memberA, memberB, outsider] = await ethers.getSigners();

    const CBTToken = await ethers.getContractFactory("CBTToken");
    cbtToken = await CBTToken.deploy();
    await cbtToken.waitForDeployment();
  });

  it("배포자가 컨트랙트 owner이고 초기 전체 발행량은 0이다", async function () {
    expect(await cbtToken.name()).to.equal("Contribution Based Token");
    expect(await cbtToken.symbol()).to.equal("CBT");
    expect(await cbtToken.decimals()).to.equal(18);
    expect(await cbtToken.totalSupply()).to.equal(0n);
    expect(await cbtToken.owner()).to.equal(owner.address);
  });

  it("관리자가 입력 단위 50으로 지급하면 정확히 50 CBT가 발행된다", async function () {
    const expectedAmount = ethers.parseUnits("50", 18);

    await expect(cbtToken.connect(owner).grantContributionToken(memberA.address, 50n))
      .to.emit(cbtToken, "ContributionTokenGranted")
      .withArgs(memberA.address, 50n, owner.address);

    expect(await cbtToken.balanceOf(memberA.address)).to.equal(expectedAmount);
    expect(await cbtToken.totalSupply()).to.equal(expectedAmount);
  });

  it("동일 주소에 추가 지급하면 잔액과 전체 발행량이 누적된다", async function () {
    await (await cbtToken.connect(owner).grantContributionToken(memberA.address, 50n)).wait();
    await (await cbtToken.connect(owner).grantContributionToken(memberA.address, 20n)).wait();

    expect(await cbtToken.balanceOf(memberA.address)).to.equal(ethers.parseUnits("70", 18));
    expect(await cbtToken.totalSupply()).to.equal(ethers.parseUnits("70", 18));
  });

  it("관리자가 아닌 계정은 기여 토큰을 지급할 수 없다", async function () {
    await expect(
      cbtToken.connect(outsider).grantContributionToken(memberA.address, 50n)
    ).to.be.reverted;
  });

  it("0 주소나 0 수량으로 지급하면 실패한다", async function () {
    await expect(
      cbtToken.connect(owner).grantContributionToken(ethers.ZeroAddress, 50n)
    ).to.be.revertedWithCustomError(cbtToken, "InvalidMemberAddress");

    await expect(
      cbtToken.connect(owner).grantContributionToken(memberA.address, 0n)
    ).to.be.revertedWithCustomError(cbtToken, "InvalidAmount");
  });

  it("기존 최소 단위 mint와 burnFrom도 관리자 권한으로 정상 동작한다", async function () {
    const amount = ethers.parseUnits("10", 18);

    await (await cbtToken.connect(owner).mint(memberA.address, amount)).wait();
    await expect(cbtToken.connect(owner).burnFrom(memberA.address, amount)).to.not.be.reverted;

    await expect(cbtToken.connect(outsider).mint(memberB.address, amount)).to.be.reverted;
    await expect(cbtToken.connect(outsider).burnFrom(memberA.address, amount)).to.be.reverted;
  });

  it("잘못된 최소 단위 mint와 burnFrom 입력은 실패한다", async function () {
    const amount = ethers.parseUnits("10", 18);

    await expect(cbtToken.connect(owner).mint(ethers.ZeroAddress, amount)).to.be.revertedWithCustomError(
      cbtToken,
      "InvalidMemberAddress"
    );
    await expect(cbtToken.connect(owner).mint(memberA.address, 0n)).to.be.revertedWithCustomError(
      cbtToken,
      "InvalidAmount"
    );
    await expect(cbtToken.connect(owner).burnFrom(ethers.ZeroAddress, amount)).to.be.revertedWithCustomError(
      cbtToken,
      "InvalidMemberAddress"
    );
    await expect(cbtToken.connect(owner).burnFrom(memberA.address, 0n)).to.be.revertedWithCustomError(
      cbtToken,
      "InvalidAmount"
    );

    await (await cbtToken.connect(owner).mint(memberA.address, amount)).wait();
    await expect(cbtToken.connect(owner).burnFrom(memberA.address, amount + 1n)).to.be.revertedWithCustomError(
      cbtToken,
      "InsufficientBalanceForBurn"
    );
  });

  it("사용자 간 transfer와 approve, transferFrom은 모두 차단된다", async function () {
    const amount = ethers.parseUnits("10", 18);

    await (await cbtToken.connect(owner).mint(memberA.address, amount)).wait();

    await expect(cbtToken.connect(memberA).transfer(memberB.address, amount)).to.be.revertedWithCustomError(
      cbtToken,
      "UserTransferNotAllowed"
    );
    await expect(cbtToken.connect(memberA).approve(memberB.address, amount)).to.be.revertedWithCustomError(
      cbtToken,
      "UserTransferNotAllowed"
    );
    await expect(cbtToken.connect(memberB).transferFrom(memberA.address, memberB.address, amount)).to.be
      .revertedWithCustomError(cbtToken, "UserTransferNotAllowed");
  });
});
