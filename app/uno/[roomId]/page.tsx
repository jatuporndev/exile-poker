import { UnoTable } from "../../../src/games/uno/presentation/UnoTable";
import { getCardSkins } from "../../../src/shared/cardSkins";

export const dynamic = "force-dynamic";

export default async function UnoGamePage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <UnoTable cardSkins={getCardSkins()} roomId={roomId} />;
}
