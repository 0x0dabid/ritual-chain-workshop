import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { encodePacked, keccak256, parseEther, zeroHash } from "viem";

function commitment(answer: string, salt: `0x${string}`, submitter: `0x${string}`, bountyId: bigint) {
  return keccak256(
    encodePacked(
      ["string", "bytes32", "address", "uint256"],
      [answer, salt, submitter, bountyId],
    ),
  );
}

async function expectRejects(promise: Promise<unknown>, reason: string) {
  await assert.rejects(promise, (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    assert.match(message, new RegExp(reason));
    return true;
  });
}

describe("AIJudge commit-reveal homework flow", async () => {
  const connection = await network.connect();
  const { viem, networkHelpers } = connection;

  let owner: Awaited<ReturnType<typeof viem.getWalletClients>>[number];
  let alice: Awaited<ReturnType<typeof viem.getWalletClients>>[number];
  let bob: Awaited<ReturnType<typeof viem.getWalletClients>>[number];
  let judge: any;

  beforeEach(async () => {
    [owner, alice, bob] = await viem.getWalletClients();
    judge = await viem.deployContract("AIJudge");
  });

  async function createBounty() {
    const now = BigInt(await networkHelpers.time.latest());
    const submissionDeadline = now + 100n;
    const revealDeadline = now + 200n;

    await judge.write.createBounty(
      ["Best Ritual explainer", "Correctness 70%, clarity 30%", submissionDeadline, revealDeadline],
      { account: owner.account, value: parseEther("1") },
    );

    return { bountyId: 1n, submissionDeadline, revealDeadline };
  }

  it("accepts one commitment before the submission deadline and hides the answer", async () => {
    const { bountyId } = await createBounty();
    const salt = zeroHash;
    const answer = "Ritual lets smart contracts call AI through precompiles.";
    const hash = commitment(answer, salt, alice.account.address, bountyId);

    await judge.write.submitCommitment([bountyId, hash], { account: alice.account });

    const submission = await judge.read.getSubmission([bountyId, 0n]);
    assert.equal(submission[0].toLowerCase(), alice.account.address.toLowerCase());
    assert.equal(submission[1], hash);
    assert.equal(submission[2], false);
    assert.equal(submission[3], "");
  });

  it("rejects duplicate commitments and late commitments", async () => {
    const { bountyId, submissionDeadline } = await createBounty();
    const hash = commitment("first", zeroHash, alice.account.address, bountyId);

    await judge.write.submitCommitment([bountyId, hash], { account: alice.account });
    await expectRejects(
      judge.write.submitCommitment([bountyId, hash], { account: alice.account }),
      "already committed",
    );

    await networkHelpers.time.increaseTo(Number(submissionDeadline + 1n));
    const bobHash = commitment("late", zeroHash, bob.account.address, bountyId);
    await expectRejects(
      judge.write.submitCommitment([bountyId, bobHash], { account: bob.account }),
      "submission phase closed",
    );
  });

  it("reveals only during reveal phase and rejects wrong salt or wrong sender", async () => {
    const { bountyId, submissionDeadline } = await createBounty();
    const salt = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
    const wrongSalt = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;
    const answer = "The answer uses Ritual LLM as a batch judge.";
    const hash = commitment(answer, salt, alice.account.address, bountyId);

    await judge.write.submitCommitment([bountyId, hash], { account: alice.account });

    await expectRejects(
      judge.write.revealAnswer([bountyId, answer, salt], { account: alice.account }),
      "reveal phase not started",
    );

    await networkHelpers.time.increaseTo(Number(submissionDeadline + 1n));

    await expectRejects(
      judge.write.revealAnswer([bountyId, answer, wrongSalt], { account: alice.account }),
      "commitment mismatch",
    );

    await expectRejects(
      judge.write.revealAnswer([bountyId, answer, salt], { account: bob.account }),
      "no commitment",
    );

    await judge.write.revealAnswer([bountyId, answer, salt], { account: alice.account });
    const submission = await judge.read.getSubmission([bountyId, 0n]);
    assert.equal(submission[2], true);
    assert.equal(submission[3], answer);
  });

  it("judges only after reveal deadline and finalizes only a revealed winner", async () => {
    const { bountyId, submissionDeadline, revealDeadline } = await createBounty();
    const salt = "0x3333333333333333333333333333333333333333333333333333333333333333" as const;
    const answer = "A strong answer that satisfies the rubric.";
    const hash = commitment(answer, salt, alice.account.address, bountyId);

    await judge.write.submitCommitment([bountyId, hash], { account: alice.account });
    await networkHelpers.time.increaseTo(Number(submissionDeadline + 1n));
    await judge.write.revealAnswer([bountyId, answer, salt], { account: alice.account });

    await expectRejects(
      judge.write.judgeAll([bountyId, "0x1234"], { account: owner.account }),
      "reveal phase still active",
    );

    const mock = await viem.deployContract("MockLLMPrecompile");
    const publicClient = await viem.getPublicClient();
    const mockCode = await publicClient.getBytecode({ address: mock.address });
    assert.ok(mockCode);
    await networkHelpers.setCode("0x0000000000000000000000000000000000000802", mockCode);

    await networkHelpers.time.increaseTo(Number(revealDeadline + 1n));
    await judge.write.judgeAll([bountyId, "0x1234"], { account: owner.account });

    await expectRejects(
      judge.write.finalizeWinner([bountyId, 1n], { account: owner.account }),
      "invalid winner",
    );

    const before = await publicClient.getBalance({ address: alice.account.address });
    await judge.write.finalizeWinner([bountyId, 0n], { account: owner.account });
    const after = await publicClient.getBalance({ address: alice.account.address });
    assert.ok(after > before);
  });
});
