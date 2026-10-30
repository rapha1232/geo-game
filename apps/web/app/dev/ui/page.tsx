import { notFound } from "next/navigation";
import { Gallery } from "./Gallery";

// Developer playground for the shared components. Hidden on the Vercel production deployment.
export default function DevUiPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <Gallery />;
}
