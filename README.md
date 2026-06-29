# Privacy-preserving AI Bounty Judge

This is my solution for the Ritual AI Bounty Judge privacy assignment. I stayed on the required commit-reveal track, then added a short note on how I would approach the more Ritual-native private version.

## What changed

The workshop version had one big problem: answers were stored in plaintext as soon as someone submitted. That means another participant could read an early answer, improve it, and submit something better before the deadline.

I changed the flow so participants commit first and reveal later.

1. The bounty owner creates a bounty with a reward, rubric, submission deadline, and reveal deadline.
2. During the submission phase, a participant submits only a `bytes32` commitment.
3. After the submission deadline, the participant reveals the original `answer` and `salt`.
4. The contract checks the reveal with:

```solidity
keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))
```

5. If the hash matches the stored commitment, the answer counts as revealed and valid.
6. After the reveal deadline, the owner calls `judgeAll` once with the valid revealed answers in one batch.
7. The AI gives a review/ranking, but the bounty owner still picks the final winner and calls `finalizeWinner`.

This does not make answers private forever. It mainly fixes the deadline-copying problem, which was the bug we were asked to solve in the required track.

## Required contract functions

The main contract is here:

```txt
hardhat/contracts/AIJudge.sol
```

It includes the required functions:

```solidity
submitCommitment(uint256 bountyId, bytes32 commitment)
revealAnswer(uint256 bountyId, string calldata answer, bytes32 salt)
judgeAll(uint256 bountyId, bytes calldata llmInput)
finalizeWinner(uint256 bountyId, uint256 winnerIndex)
```

A few other safety checks were added too:

- one commitment per participant per bounty;
- no empty commitment;
- no late commitment;
- reveal only after the submission deadline and before the reveal deadline;
- reject wrong salt / wrong sender reveals;
- judge only after the reveal phase is over;
- only revealed submissions can win; and
- reward can only be paid once.

## Test plan

The main tests are in:

```txt
hardhat/test/AIJudge.commitReveal.test.ts
```

The tests check the cases I cared about most:

- a normal commitment is accepted before the deadline;
- the answer is not stored before reveal;
- duplicate commitments are rejected;
- late commitments are rejected;
- reveal before the reveal phase is rejected;
- reveal with the wrong salt is rejected;
- reveal from the wrong sender is rejected;
- a correct reveal is accepted;
- judging before the reveal deadline is rejected;
- `judgeAll` works after the reveal deadline;
- an unrevealed submission cannot be finalized as winner; and
- a revealed winner can be finalized and paid.

Run the contract tests:

```bash
cd hardhat
corepack pnpm hardhat compile
corepack pnpm hardhat test
```

Run the frontend build:

```bash
cd web
corepack pnpm build
```

## Architecture note

For the required track, I used a normal EVM commit-reveal pattern. The chain stores the commitment during the submission phase. It does not store the answer until the participant reveals it later.

The frontend helps by generating a salt, computing the commitment locally, and saving the answer plus salt in the browser so the participant can reveal later. During judging, the frontend reads only the valid revealed submissions and builds one Ritual LLM input for the whole bounty. That keeps the Ritual part as batch judging instead of one LLM call per answer.

The contract stores the AI review, but it does not let the AI directly move funds. The human owner still calls `finalizeWinner`, and the contract checks that the selected winner is a real revealed submission before paying.

## Advanced Ritual-native private judging idea

Commit-reveal is useful, but it still puts answers on-chain during the reveal phase. A more private Ritual-native version would keep answers encrypted off-chain and only store commitments or encrypted storage references on-chain.

In that design, plaintext would exist in two places: first in the participant's browser before encryption, and later inside a TEE-backed Ritual executor during judging. The public chain would store things like the encrypted bundle hash, answer count commitment, and AI result hash/reference. The LLM would receive all decrypted submissions together inside the trusted execution environment, judge them in one batch, and return a result. That would hide answers even after judging, but it needs more infrastructure than the required commit-reveal version.

## Reflection

The public chain should store the bounty rules, deadlines, reward amount, commitments, reveal status, AI review, and final payout result. The actual answers should stay hidden during the submission phase so people cannot copy each other before the deadline. In this required version, answers become public during reveal because the contract needs to verify the commitment. AI should help compare the revealed answers against the rubric and give a ranking or recommendation. A human should still decide the final winner because AI can misunderstand an answer or be influenced by weird prompt content inside submissions. The contract should enforce the boring but important rules: deadlines, valid reveals, one payout, and no unrevealed winner.
