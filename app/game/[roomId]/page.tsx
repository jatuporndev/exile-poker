import { GameTable } from "../../../src/features/game/presentation/GameTable";

export default async function GamePage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <GameTable roomId={roomId} />;
}
