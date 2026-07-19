# CBT Contribution Reward Project

Hardhat, Solidity, ethers v6, and a Vite React frontend are used to run a local CBT contribution reward project.

The screen is not a numbered simulation flow. It is a single project dashboard with menus:

- Basic Configuration
- Participants
- Contribution Criteria
- CBT Management
- Share Status
- Reward Management
- Activity History

Users can move between menus freely. Actual action availability is controlled by smart contract state such as `sharesFinalized`, deposited reward amount, CBT balances, and `hasClaimed`.

## Local Run

Start the Hardhat node:

```bash
npm run node
```

Deploy the contracts in another terminal:

```bash
npm run deploy:local
```

The deployment script is `scripts/deploy.ts`. There is no `scripts/deploy.js` in this project.

Start the frontend:

```bash
cd frontend
npm run dev
```

Open the Vite URL, usually:

```text
http://127.0.0.1:5173
```

## Project Operation

The frontend connects to `http://127.0.0.1:8545` and loads Hardhat accounts with `eth_accounts`.

The first Hardhat account is treated as the project admin. Other Hardhat accounts are shown as participant candidates. A candidate becomes a project participant only after the user explicitly registers it.

The normal operating flow is:

1. Register project participants from Hardhat candidates or manual addresses.
2. Set the project target CBT supply. The default frontend target is 100 CBT.
3. Manage contribution criteria and default CBT amounts.
4. Grant CBT according to criteria, with optional adjustment.
5. Revoke CBT when an incorrect grant must be adjusted.
6. Confirm each participant's CBT balance and share ratio.
7. Finalize project shares.
8. Deposit ETH reward into `RewardVault`.
9. Check expected rewards.
10. Let each Hardhat participant claim ETH with their own signer.
11. Review activity and transaction history.

The UI does not force menu order. For example, the Reward Management menu is visible before share finalization, but the deposit button stays disabled until the project shares are finalized.

## Contract Rules

`CBTToken` supports:

- Admin-only CBT grants through `grantContributionToken`
- Admin-only CBT revokes through `revokeContributionToken`
- User transfer blocking
- Share finalization through `finalizeShares`
- Grant and revoke blocking after finalization

`RewardVault` supports:

- ETH deposit only after shares are finalized
- One reward deposit for the current reward round
- Reward calculation from CBT share ratio
- Participant self-claim through `claimReward`
- Duplicate claim blocking through `hasClaimed`
- Vault balance and claimed amount lookup

## Local Storage

The frontend stores display and project metadata in browser `localStorage`:

- `cbt_project_info`
- `cbt_hardhat_account_names`
- `cbt_project_participants`
- `cbt_contribution_criteria`
- `cbt_transaction_history`

These records do not modify blockchain state. To reset blockchain state, restart the Hardhat node and redeploy the contracts.

The target CBT supply is saved in `cbt_project_info`. It controls frontend guidance and prevents the UI from sending grants that exceed the configured target, but it is not a smart contract cap.

## Verification

Run from the project root:

```bash
npm run compile
npm test
```

Run the frontend build:

```bash
cd frontend
npm run build
```

If the Hardhat node is restarted, run `npm run deploy:local` again so `frontend/contract-addresses.json` points to live contracts.
