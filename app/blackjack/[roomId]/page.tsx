import { BlackjackTable } from "../../../src/games/blackjack/presentation/BlackjackTable";
import { getCardSkins } from "../../../src/shared/cardSkins";

export const dynamic = "force-dynamic";

export default async function BlackjackGamePage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <BlackjackTable cardSkins={getCardSkins()} roomId={roomId} />;
}
