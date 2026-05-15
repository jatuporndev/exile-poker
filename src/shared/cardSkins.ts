import { readdirSync } from "fs";
import path from "path";

export type CardSkin = {
  id: string;
  label: string;
  src: string;
};

const skinDirectory = path.join(process.cwd(), "public", "skins");
const supportedSkinExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);

export function getCardSkins(): CardSkin[] {
  try {
    return readdirSync(skinDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((fileName) => supportedSkinExtensions.has(path.extname(fileName).toLowerCase()))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .map((fileName) => {
        const id = path.parse(fileName).name;
        return {
          id,
          label: labelFromFileName(id),
          src: `/skins/${fileName}`,
        };
      });
  } catch {
    return [];
  }
}

function labelFromFileName(fileName: string): string {
  return fileName
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
