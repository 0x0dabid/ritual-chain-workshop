# Ritual AI Bounty Judge — Proof of Building

This fork implements the Ritual Academy homework privacy improvement for the AI Bounty Judge workshop app.

## What changed

The original workshop contract stored plaintext answers immediately in `submitAnswer`, so later participants could read previous answers and copy/improve them before the deadline. This version replaces that flow with commit-reveal:

1. The bounty owner creates a bounty with separate `submissionDeadline` and `revealDeadline`.
2. Participants submit only a `bytes32 commitment` during the commit/submission phase.
3. Participants reveal their plaintext `answer` and `salt` during the reveal phase.
4. The contract verifies the reveal with:

```solidity
keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId)) == storedCommitment
```

5. Only valid revealed submissions are eligible for AI judging.
6. After the reveal deadline, the owner calls `judgeAll` once with a single batch Ritual LLM request.
7. The AI review is advisory; the owner finalizes one winner and the contract pays the reward once.

## Main files changed

- `hardhat/contracts/AIJudge.sol`
  - added `submitCommitment(uint256 bountyId, bytes32 commitment)`
  - added `revealAnswer(uint256 bountyId, string calldata answer, bytes32 salt)`
  - changed `createBounty` to accept `submissionDeadline` and `revealDeadline`
  - changed `Submission` to store `commitment`, `revealed`, and `answer`
  - bounds-checks `finalizeWinner` and requires the winner to be a revealed submission
  - keeps Ritual LLM judging as one batch call via precompile `0x0000000000000000000000000000000000000802`

- `hardhat/test/AIJudge.commitReveal.test.ts`
  - tests the homework commit-reveal lifecycle and invalid reveal cases

- `hardhat/contracts/test/MockLLMPrecompile.sol`
  - local-only mock used to test `judgeAll` without relying on a live precompile in local Hardhat

- `web/src/components/CreateBountyForm.tsx`
  - collects separate commit/submission and reveal deadlines

- `web/src/components/SubmitAnswer.tsx`
  - generates a browser salt
  - computes the commitment client-side
  - stores answer+salt locally for reveal
  - submits only the commitment on-chain during commit phase
  - reveals answer+salt during reveal phase

- `web/src/components/SubmissionsList.tsx`
  - shows commitments before reveal and plaintext only after reveal

- `web/src/components/JudgeAll.tsx`
  - gathers only revealed submissions for the single batch Ritual LLM judging request

## Verification performed locally

Contract compile and tests:

```bash
cd hardhat
corepack pnpm hardhat compile
corepack pnpm hardhat test
```

Observed result:

```txt
Compiled 2 Solidity files with solc 0.8.24 (evm target: shanghai)
4 passing (4 nodejs)
```

Frontend production build:

```bash
cd web
corepack pnpm build
```

Observed result:

```txt
✓ Compiled successfully
Finished TypeScript
✓ Generating static pages
```

## Ritual-specific design

This solution uses a normal on-chain commit-reveal pattern for the required homework deliverable and preserves the Ritual-specific AI step as a batch inference. The LLM is not called once per answer; instead, after the reveal phase, the frontend builds one structured prompt containing all valid revealed answers and passes one encoded request to `judgeAll`. The contract forwards that request to the Ritual LLM precompile at `0x0802` and stores the returned review. The AI output recommends/ranks submissions, but the human bounty owner still chooses the final winner, which is important because reward payout should remain an explicit owner action.

## Commit-reveal vs Ritual-native private judging

Commit-reveal hides answers during the submission phase but eventually reveals plaintext on-chain, so it prevents deadline copying but does not provide permanent privacy. A more Ritual-native private design would keep answers encrypted off-chain, commit only content hashes/storage references on-chain, and let a TEE-backed Ritual executor decrypt the bundle for batch LLM judging. The contract could store the encrypted bundle hash, the answer-count commitment, and the AI result hash/reference so users can audit that the judged set matches the committed set. In that design, plaintext exists only inside the participant's browser before encryption and inside the trusted execution environment during judging. This is stronger privacy, but it requires more infrastructure than the required homework flow.

## Reflection

The public chain should store bounty metadata, deadlines, reward amount, commitments, reveal status, AI review output, and the final payout result. Participant answers should be hidden during the submission phase so competitors cannot copy each other before the deadline. In the required version, answers become public only during the reveal phase because the contract must verify each commitment. The AI should evaluate all revealed answers together against the rubric and produce a recommendation or ranking. The human owner should make the final payout decision because AI output can be wrong, ambiguous, or influenced by prompt-injection attempts inside submissions. The contract should enforce the lifecycle and payout safety rules so neither the owner nor participants can skip phases or pay twice.

## Deployment proof fields

The proof form asks for:

- GitHub fork URL
- Deployed contract address
- Deploy transaction hash
- A step struggled with

Suggested struggle answer:

> The hardest step was converting the original public `submitAnswer` flow into a safe commit-reveal lifecycle without breaking the Ritual batch AI judging step. I had to separate submission and reveal deadlines, store only commitments before reveal, verify `keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))`, and make sure `judgeAll` only includes valid revealed answers.

Deployment address and transaction hash will be filled after deployment to Ritual Chain.
