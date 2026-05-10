import { cardLabel } from "../src/features/poker/domain/cards";
import { createDeck, drawCards, shuffleDeck } from "../src/features/poker/domain/deck";
import { evaluateBestHand } from "../src/features/poker/domain/handEvaluator";
import type { Card } from "../src/features/poker/domain/types";

const handLabels = [
  "Royal flush",
  "Straight flush",
  "Four of a kind",
  "Full house",
  "Flush",
  "Straight",
  "Three of a kind",
  "Two pair",
  "Pair",
  "High card",
] as const;

type HandLabel = (typeof handLabels)[number];

type Options = {
  forever: boolean;
  targetPerLabel: number;
  maxHands: number | null;
  reportEvery: number;
};

const options = parseOptions(process.argv.slice(2));
const counts = Object.fromEntries(handLabels.map((label) => [label, 0])) as Record<HandLabel, number>;
const firstSeenHands = new Map<HandLabel, Card[]>();
const startedAt = Date.now();
let totalHands = 0;
let lastReportAt = 0;

while (options.forever || !hasReachedTarget(counts, options.targetPerLabel)) {
  if (options.maxHands !== null && totalHands >= options.maxHands) {
    break;
  }

  const deck = shuffleDeck(createDeck());
  const draw = drawCards(deck, 5);
  const evaluated = evaluateBestHand(draw.cards);
  const label = normalizeLabel(evaluated.label, evaluated.score);

  counts[label] += 1;
  totalHands += 1;

  if (!firstSeenHands.has(label)) {
    firstSeenHands.set(label, draw.cards);
  }

  const now = Date.now();
  if (
    totalHands === 1 ||
    totalHands % options.reportEvery === 0 ||
    now - lastReportAt >= 500 ||
    hasReachedTarget(counts, options.targetPerLabel)
  ) {
    lastReportAt = now;
    renderLiveReport();
  }
}

renderLiveReport(true);

function normalizeLabel(label: string, score: number[]): HandLabel {
  if (label === "Straight flush" && score[1] === 14) {
    return "Royal flush";
  }

  if (isHandLabel(label)) {
    return label;
  }

  throw new Error(`Unexpected hand label: ${label}`);
}

function isHandLabel(label: string): label is HandLabel {
  return handLabels.includes(label as HandLabel);
}

function hasReachedTarget(currentCounts: Record<HandLabel, number>, target: number): boolean {
  return handLabels.every((label) => currentCounts[label] >= target);
}

function renderLiveReport(final = false): void {
  const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
  const handsPerSecond = Math.round(totalHands / elapsedSeconds);
  const found = handLabels.filter((label) => counts[label] > 0).length;
  const lines = [
    `${final ? "Final" : "Live"} draw simulation`,
    `Hands: ${formatNumber(totalHands)} | Rate: ${formatNumber(handsPerSecond)}/s | Found: ${found}/${handLabels.length}`,
    "",
    ...handLabels.map((label) => {
      const count = counts[label];
      const chance = totalHands === 0 ? "0.000000%" : `${((count / totalHands) * 100).toFixed(6)}%`;
      const firstHand = firstSeenHands.get(label);
      const example = firstHand ? ` | first: ${firstHand.map(cardLabel).join(" ")}` : "";
      return `${label.padEnd(16)} ${formatNumber(count).padStart(10)} ${chance.padStart(11)}${example}`;
    }),
  ];

  process.stdout.write(`\x1Bc${lines.join("\n")}\n`);
}

function parseOptions(args: string[]): Options {
  const options: Options = {
    forever: false,
    targetPerLabel: 1,
    maxHands: null,
    reportEvery: 10_000,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--forever") {
      options.forever = true;
    } else if (arg === "--target") {
      options.targetPerLabel = parsePositiveInteger(next, arg);
      index += 1;
    } else if (arg === "--max-hands") {
      options.maxHands = parsePositiveInteger(next, arg);
      index += 1;
    } else if (arg === "--report-every") {
      options.reportEvery = parsePositiveInteger(next, arg);
      index += 1;
    } else if (arg === "--help") {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function parsePositiveInteger(value: string | undefined, optionName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} needs a positive integer value.`);
  }

  return parsed;
}

function printHelpAndExit(): never {
  console.log(`Usage: npm run simulate:draws -- [options]

Draws 5 cards from a shuffled full deck, evaluates the hand, resets the deck,
shuffles again, and repeats until every hand label reaches the target count.

Options:
  --target <n>        Stop after every label has at least n wins. Default: 1
  --max-hands <n>     Stop after n total hands even if the target is not reached.
  --report-every <n>  Refresh output every n hands. Default: 10000
  --forever           Never stop automatically.
  --help              Show this help.
`);
  process.exit(0);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
