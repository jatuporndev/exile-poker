import { GameTable } from "../../../src/features/game/presentation/GameTable";
import { getCardSkins } from "../../../src/shared/cardSkins";

export const dynamic = "force-dynamic";

export default async function GamePage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <GameTable cardSkins={getCardSkins()} roomId={roomId} />;
}
