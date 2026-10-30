import { notFound } from "next/navigation";
import { MapPlayground } from "./MapPlayground";

// Developer playground for GameMap with the real packs. Hidden on the Vercel production deployment.
export default function DevMapPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <MapPlayground />;
}
