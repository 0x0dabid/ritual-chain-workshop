"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { bytesToHex, encodePacked, keccak256 } from "viem";
import { useNow } from "@/hooks/useNow";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { canCommit, canReveal, type Bounty } from "@/lib/bounty";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Textarea,
  Input,
  Button,
  TxStatus,
  Notice,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

type RevealKit = {
  answer: string;
  salt: `0x${string}`;
  commitment: `0x${string}`;
};

function storageKey(bountyId: bigint, address?: string) {
  return `ai-judge-reveal-kit:${bountyId.toString()}:${address?.toLowerCase() ?? "unknown"}`;
}

function newSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function makeCommitment({
  answer,
  salt,
  submitter,
  bountyId,
}: {
  answer: string;
  salt: `0x${string}`;
  submitter: `0x${string}`;
  bountyId: bigint;
}): `0x${string}` {
  return keccak256(
    encodePacked(
      ["string", "bytes32", "address", "uint256"],
      [answer, salt, submitter, bountyId],
    ),
  );
}

export function SubmitAnswer({
  bountyId,
  bounty,
  onSubmitted,
}: {
  bountyId: bigint;
  bounty: Bounty;
  onSubmitted: () => void;
}) {
  const { address, isConnected } = useAccount();
  const [answer, setAnswer] = useState("");
  const [revealAnswer, setRevealAnswer] = useState("");
  const [salt, setSalt] = useState<`0x${string}` | "">("");
  const [savedKit, setSavedKit] = useState<RevealKit | null>(null);
  const [lastAction, setLastAction] = useState<"commit" | "reveal" | null>(null);
  const now = useNow();

  const key = useMemo(() => storageKey(bountyId, address), [bountyId, address]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        setSavedKit(null);
        setRevealAnswer("");
        setSalt("");
        return;
      }
      const parsed = JSON.parse(raw) as RevealKit;
      setSavedKit(parsed);
      setRevealAnswer(parsed.answer);
      setSalt(parsed.salt);
    } catch {
      setSavedKit(null);
    }
  }, [key]);

  const tx = useWriteTx(() => {
    if (lastAction === "commit") {
      setAnswer("");
    }
    if (lastAction === "reveal") {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore storage errors */
      }
      setSavedKit(null);
    }
    onSubmitted();
  });

  const commitOpen = canCommit(bounty, now / 1000);
  const revealOpen = canReveal(bounty, now / 1000);

  if (!commitOpen && !revealOpen) return null;

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !contractAddress || !address) return;

    const trimmed = answer.trim();
    const generatedSalt = newSalt();
    const commitment = makeCommitment({
      answer: trimmed,
      salt: generatedSalt,
      submitter: address,
      bountyId,
    });

    try {
      setLastAction("commit");
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "submitCommitment",
        args: [bountyId, commitment],
        chainId: ritualChain.id,
      });

      const kit = { answer: trimmed, salt: generatedSalt, commitment };
      window.localStorage.setItem(key, JSON.stringify(kit));
      setSavedKit(kit);
      setRevealAnswer(trimmed);
      setSalt(generatedSalt);
    } catch {
      /* surfaced via tx.state */
    }
  }

  async function handleReveal(e: React.FormEvent) {
    e.preventDefault();
    if (!revealAnswer.trim() || !salt || !contractAddress) return;
    try {
      setLastAction("reveal");
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "revealAnswer",
        args: [bountyId, revealAnswer.trim(), salt],
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via tx.state */
    }
  }

  return (
    <Card>
      <CardHeader
        title={commitOpen ? "Commit an answer" : "Reveal your answer"}
        subtitle={
          commitOpen
            ? "Your answer stays hidden on-chain until the reveal phase."
            : "Reveal the original answer and salt so the commitment can be verified."
        }
      />
      <CardBody>
        {commitOpen && (
          <form onSubmit={handleCommit} className="space-y-3">
            <Notice tone="indigo">
              Privacy flow: the browser generates a random salt, hashes your answer + salt + wallet
              + bounty id, and submits only the bytes32 commitment.
            </Notice>
            <Field label="Your answer">
              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={5}
                placeholder="Write your submission…"
              />
            </Field>
            <Button
              type="submit"
              disabled={!isConnected || !address || !answer.trim() || tx.isBusy}
              className="w-full"
            >
              {tx.isBusy ? "Committing…" : "Submit hidden commitment"}
            </Button>
            {!isConnected && (
              <p className="text-xs text-zinc-500">Connect your wallet to submit.</p>
            )}
          </form>
        )}

        {revealOpen && (
          <form onSubmit={handleReveal} className="space-y-3">
            {savedKit ? (
              <Notice tone="green">
                Found your locally saved answer + salt for this bounty. Keep this data private until
                you reveal.
              </Notice>
            ) : (
              <Notice tone="amber">
                No local reveal data found. Paste the exact answer and salt generated during commit.
              </Notice>
            )}
            <Field label="Answer to reveal">
              <Textarea
                value={revealAnswer}
                onChange={(e) => setRevealAnswer(e.target.value)}
                rows={5}
                placeholder="Exact answer used during commit…"
              />
            </Field>
            <Field label="Salt" hint="32-byte 0x-prefixed salt created during commit.">
              <Input
                value={salt}
                onChange={(e) => setSalt(e.target.value as `0x${string}`)}
                placeholder="0x…"
                className="font-mono"
              />
            </Field>
            {savedKit && (
              <p className="break-all rounded-xl bg-black/20 p-2 text-[11px] text-zinc-500">
                Commitment: <span className="font-mono">{savedKit.commitment}</span>
              </p>
            )}
            <Button
              type="submit"
              disabled={!isConnected || !revealAnswer.trim() || !salt || tx.isBusy}
              className="w-full"
            >
              {tx.isBusy ? "Revealing…" : "Reveal answer"}
            </Button>
          </form>
        )}

        <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
      </CardBody>
    </Card>
  );
}
