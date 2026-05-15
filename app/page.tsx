import { StartScreen } from "../src/features/start/presentation/StartScreen";
import { getCardSkins } from "../src/shared/cardSkins";

export const dynamic = "force-dynamic";

export default function Home() {
  return <StartScreen cardSkins={getCardSkins()} />;
}
