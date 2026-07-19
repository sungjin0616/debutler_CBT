import { promises as fs } from "fs";
import path from "path";
import { artifacts, ethers } from "hardhat";

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function main(): Promise<void> {
  try {
    const [admin] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    console.log("=== CBT local deployment started ===");
    console.log("Admin address:", admin.address);

    const CBTTokenFactory = await ethers.getContractFactory("CBTToken");
    const cbtToken = await CBTTokenFactory.deploy();
    await cbtToken.waitForDeployment();
    const cbtTokenAddress = await cbtToken.getAddress();

    const RewardVaultFactory = await ethers.getContractFactory("RewardVault");
    const rewardVault = await RewardVaultFactory.deploy(cbtTokenAddress);
    await rewardVault.waitForDeployment();
    const rewardVaultAddress = await rewardVault.getAddress();

    const totalSupply = await cbtToken.totalSupply();
    const finalized = await cbtToken.finalized();

    console.log("CBTToken:", cbtTokenAddress);
    console.log("RewardVault:", rewardVaultAddress);
    console.log("Initial total supply:", ethers.formatUnits(totalSupply, 18), "CBT");
    console.log("Shares finalized:", finalized);

    const addressFile = path.resolve(__dirname, "../frontend/contract-addresses.json");
    await writeJsonFile(addressFile, {
      cbtToken: cbtTokenAddress,
      cbtTokenAddress,
      rewardVault: rewardVaultAddress,
      rewardVaultAddress,
      contributionReward: rewardVaultAddress,
      admin: admin.address,
      chainId: network.chainId.toString(),
    });

    const cbtArtifact = await artifacts.readArtifact("CBTToken");
    const rewardVaultArtifact = await artifacts.readArtifact("RewardVault");
    const abiDirectory = path.resolve(__dirname, "../frontend/abi");

    await writeJsonFile(path.resolve(abiDirectory, "CBTToken.json"), cbtArtifact.abi);
    await writeJsonFile(path.resolve(abiDirectory, "RewardVault.json"), rewardVaultArtifact.abi);

    console.log("Frontend address file written:", addressFile);
    console.log("=== CBT local deployment complete ===");
  } catch (error) {
    console.error("Deployment failed.");
    console.error(error);
    process.exitCode = 1;
  }
}

main();
