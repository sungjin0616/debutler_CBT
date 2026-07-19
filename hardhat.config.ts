import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

/**
 * ContriSplit 스마트 컨트랙트 개발용 Hardhat 설정 파일이다.
 * 실제 외부 네트워크는 사용하지 않고 로컬 Hardhat 환경에서 개발한다.
 */
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        // 컴파일된 바이트코드의 실행 비용과 배포 비용을 낮추기 위해 최적화를 활성화한다.
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Hardhat 내장 로컬 네트워크를 기본으로 사용한다.
    hardhat: {},
    // 이후 로컬 배포 스크립트에서 localhost를 사용할 수 있도록 설정한다.
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
  paths: {
    // Solidity 컨트랙트 파일이 위치하는 경로다.
    sources: "./contracts",
    // 자동 테스트 파일이 위치하는 경로다.
    tests: "./test",
    // 컴파일 캐시 파일이 저장되는 경로다.
    cache: "./cache",
    // ABI와 바이트코드가 생성되는 경로다.
    artifacts: "./artifacts",
  },
};

export default config;
