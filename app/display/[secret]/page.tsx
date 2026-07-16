import { notFound } from "next/navigation";
import DisplayClient from "@/components/display/DisplayClient";

type PageProps = {
  params: Promise<{ secret: string }>;
};

export const metadata = {
  title: "LED Display — 2Res Demo",
  robots: { index: false, follow: false },
};

export default async function DisplayPage({ params }: PageProps) {
  const { secret } = await params;
  const expected = process.env.DISPLAY_SECRET;

  if (!expected || secret !== expected) {
    notFound();
  }

  return <DisplayClient secret={secret} />;
}
