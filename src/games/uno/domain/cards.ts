import type { UnoCard, UnoColor, UnoValue } from "./types";

const valueLabels: Partial<Record<UnoValue, string>> = {
  skip: "⊘",
  reverse: "⇄",
  draw2: "+2",
  wild: "W",
  wild4: "+4",
};

const colorLabels: Record<UnoColor | "wild", string> = {
  red: "Red",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  wild: "Wild",
};

export function unoValueLabel(value: UnoValue): string {
  return valueLabels[value] ?? value;
}

export function unoColorLabel(color: UnoColor | "wild"): string {
  return colorLabels[color];
}

export function unoCardLabel(card: UnoCard): string {
  if (card.value === "wild") {
    return "Wild";
  }
  if (card.value === "wild4") {
    return "Wild +4";
  }
  return `${colorLabels[card.color]} ${unoValueLabel(card.value)}`;
}
