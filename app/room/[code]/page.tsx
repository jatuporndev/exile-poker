import { redirect } from "next/navigation";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/game/${code}`);
}
