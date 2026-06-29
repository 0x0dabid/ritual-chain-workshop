import type { Address } from "viem";

/** Parsed shape of the `getBounty` struct return value. */
export type Bounty = {
  owner: Address;
  title: string;
  rubric: string;
  reward: bigint;
  submissionDeadline: bigint;
  revealDeadline: bigint;
  judged: boolean;
  finalized: boolean;
  submissionCount: bigint;
  revealedSubmissionCount: bigint;
  winnerIndex: bigint;
  aiReview: `0x${string}`;
};

type RawBountyStruct = Bounty & readonly [
  Address,
  string,
  string,
  bigint,
  bigint,
  bigint,
  boolean,
  boolean,
  bigint,
  bigint,
  bigint,
  `0x${string}`,
];

/** getBounty returns a Solidity struct; viem exposes named fields plus tuple positions. */
export function parseBounty(raw: Bounty | RawBountyStruct | readonly unknown[]): Bounty {
  const named = raw as Partial<Bounty>;
  if (named.owner !== undefined) {
    return {
      owner: named.owner as Address,
      title: named.title ?? "",
      rubric: named.rubric ?? "",
      reward: named.reward ?? 0n,
      submissionDeadline: named.submissionDeadline ?? 0n,
      revealDeadline: named.revealDeadline ?? 0n,
      judged: named.judged ?? false,
      finalized: named.finalized ?? false,
      submissionCount: named.submissionCount ?? 0n,
      revealedSubmissionCount: named.revealedSubmissionCount ?? 0n,
      winnerIndex: named.winnerIndex ?? 0n,
      aiReview: (named.aiReview ?? "0x") as `0x${string}`,
    };
  }

  const tuple = raw as RawBountyStruct;
  return {
    owner: tuple[0],
    title: tuple[1],
    rubric: tuple[2],
    reward: tuple[3],
    submissionDeadline: tuple[4],
    revealDeadline: tuple[5],
    judged: tuple[6],
    finalized: tuple[7],
    submissionCount: tuple[8],
    revealedSubmissionCount: tuple[9],
    winnerIndex: tuple[10],
    aiReview: tuple[11],
  };
}

export type BountyStatus = "commit" | "reveal" | "ready" | "judged" | "finalized";

export function getBountyStatus(b: Bounty, nowSeconds = Date.now() / 1000): BountyStatus {
  if (b.finalized) return "finalized";
  if (b.judged) return "judged";
  if (Number(b.revealDeadline) <= nowSeconds) return "ready";
  if (Number(b.submissionDeadline) <= nowSeconds) return "reveal";
  return "commit";
}

export const STATUS_META: Record<
  BountyStatus,
  { label: string; tone: "green" | "amber" | "indigo" | "zinc" }
> = {
  commit: { label: "Commit phase", tone: "green" },
  reveal: { label: "Reveal phase", tone: "amber" },
  ready: { label: "Ready for AI judging", tone: "amber" },
  judged: { label: "Judged", tone: "indigo" },
  finalized: { label: "Finalized", tone: "zinc" },
};

/** Can a participant still submit a hidden commitment? */
export function canCommit(b: Bounty, nowSeconds = Date.now() / 1000): boolean {
  return !b.judged && !b.finalized && Number(b.submissionDeadline) > nowSeconds;
}

/** Can a participant reveal their plaintext answer and salt? */
export function canReveal(b: Bounty, nowSeconds = Date.now() / 1000): boolean {
  return (
    !b.judged &&
    !b.finalized &&
    Number(b.submissionDeadline) <= nowSeconds &&
    Number(b.revealDeadline) > nowSeconds
  );
}

/** Can the bounty owner trigger the Ritual LLM batch judge? */
export function canJudge(b: Bounty, nowSeconds = Date.now() / 1000): boolean {
  return (
    !b.judged &&
    !b.finalized &&
    Number(b.revealDeadline) <= nowSeconds &&
    b.revealedSubmissionCount > 0n
  );
}
