# Privacy-Preserving AI Bounty Judge

This fork implements the required commit-reveal privacy improvement for the Ritual AI Bounty Judge workshop assignment.

## Lifecycle

The original workshop flow stored plaintext answers as soon as participants submitted them. That made it possible for later participants to read earlier answers and copy or improve them before the deadline. This version replaces that public submission flow with a commit-reveal lifecycle:

1. The bounty owner creates a bounty with a reward, rubric, submission deadline, and reveal deadline.
2. During the submission phase, participants submit only a `bytes32` commitment hash.
3. After the submission deadline, participants reveal their plaintext `answer` and `salt`.
4. The contract verifies each reveal with:

```solidity
keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))
```

5. Only answers whose reveal matches the stored commitment are considered valid.
6. After the reveal deadline, the bounty owner calls `judgeAll` once with a single batch Ritual LLM request containing the valid revealed answers.
7. The AI review is advisory. The human bounty owner chooses the final winner with `finalizeWinner`, and the contract pays the reward once.

## Required Solidity functions

The updated contract in `hardhat/contracts/AIJudge.sol` implements the required assignment functions:

```solidity
submitCommitment(uint256 bountyId, bytes32 commitment)
revealAnswer(uint256 bountyId, string calldata answer, bytes32 salt)
judgeAll(uint256 bountyId, bytes calldata llmInput)
finalizeWinner(uint256 bountyId, uint256 winnerIndex)
```

The contract also tracks separate `submissionDeadline` and `revealDeadline` values, prevents duplicate commitments from the same participant, rejects invalid reveals, rejects unrevealed winners, and only allows judging after the reveal phase has ended.

## Test plan

The commit-reveal tests live in:

```txt
hardhat/test/AIJudge.commitReveal.test.ts
```

They cover:

- accepting a commitment before the submission deadline;
- hiding the answer before reveal;
- rejecting duplicate commitments;
- rejecting late commitments;
- rejecting reveal attempts before the reveal phase;
- rejecting reveals with the wrong salt;
- rejecting reveals from the wrong sender;
- accepting a valid reveal;
- preventing judging before the reveal deadline;
- judging only after valid reveals exist;
- preventing finalization of an unrevealed submission; and
- finalizing a valid revealed winner.

Run the contract checks with:

```bash
cd hardhat
corepack pnpm hardhat compile
corepack pnpm hardhat test
```

Run the frontend build with:

```bash
cd web
corepack pnpm build
```

## Architecture note

This solution satisfies the required track with a standard EVM-compatible commit-reveal pattern. Commitments are stored on-chain during the submission phase, but plaintext answers are not stored until participants voluntarily reveal them after the submission deadline. The frontend computes the commitment locally from the answer, salt, participant address, and bounty id, then later uses the saved answer and salt to reveal.

The Ritual-specific AI step remains a batch judging step rather than one LLM call per answer. After the reveal phase, the frontend builds one structured judging request from all valid revealed answers and passes the encoded request to `judgeAll`. The contract forwards that request to Ritual's LLM execution path and stores the returned review. The AI recommends or ranks submissions, but final payout stays under explicit human-owner control.

## Advanced Ritual-native private judging design

Commit-reveal prevents deadline copying, but revealed answers eventually become public on-chain. A stronger Ritual-native design would keep answers encrypted off-chain, store only commitments or encrypted storage references on-chain, and let a TEE-backed Ritual executor decrypt the answer bundle only during batch judging. In that version, plaintext exists in the participant's browser before encryption and inside the trusted execution environment during judging, but not as public on-chain state. The contract could store the encrypted bundle hash, answer-count commitment, and AI result hash/reference so participants can audit that the judged set matches the committed set. This provides stronger privacy, but requires more infrastructure than the required EVM commit-reveal track.

## Reflection

The public chain should store bounty metadata, deadlines, reward amount, commitments, reveal status, AI review output, and the final payout result. Participant answers should stay hidden during the submission phase so competitors cannot copy each other before the deadline. In the required commit-reveal version, answers become public during the reveal phase because the contract must verify each commitment. The AI should evaluate all valid revealed answers together against the rubric and produce a recommendation or ranking. The human owner should make the final payout decision because AI output can be wrong, ambiguous, or influenced by prompt-injection attempts inside submissions. The contract should enforce the lifecycle and payout safety rules so neither the owner nor participants can skip phases or pay twice.
