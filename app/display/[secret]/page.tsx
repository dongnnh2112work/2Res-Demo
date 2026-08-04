import { notFound } from "next/navigation";
import DisplayClient from "@/components/display/DisplayClient";

type PageProps = {
  params: Promise<{ secret: string }>;
};

export const dynamic = "force-dynamic";

export const metadata = {
  title: "LED Display",
  robots: { index: false, follow: false },
};

export default async function DisplayPage({ params }: PageProps) {
  const { secret } = await params;
  const expected = process.env.DISPLAY_SECRET?.trim();

  if (!expected) {
    return (
      <main
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#0a0d14",
          color: "rgba(243,239,230,0.75)",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ marginBottom: 8 }}>DISPLAY_SECRET chưa được set trên Vercel.</p>
          <p style={{ opacity: 0.6, fontSize: 14 }}>
            Settings → Environment Variables → thêm DISPLAY_SECRET → Redeploy
          </p>
        </div>
      </main>
    );
  }

  if (secret !== expected) {
    notFound();
  }

  return <DisplayClient secret={secret} />;
}
