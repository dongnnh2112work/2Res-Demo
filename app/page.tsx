import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wish Wall",
  description: "Điều hướng Wish Wall: gửi lời chúc hoặc mở màn hình LED",
};

export default function Home() {
  const displaySecret = process.env.DISPLAY_SECRET?.trim();
  const displayHref = displaySecret ? `/display/${displaySecret}` : null;

  return (
    <main className="hub-page">
      <div className="hub-atmosphere" aria-hidden />
      <div className="hub-shell">
        <header className="hub-brand">
          <p className="wish-brand-name">Wish Wall</p>
          <h1 className="wish-headline">Điều hướng</h1>
          <p className="wish-sub">Chọn màn hình bạn cần mở.</p>
        </header>

        <nav className="hub-nav" aria-label="Điều hướng chính">
          <Link href="/wish" className="hub-link hub-link-primary">
            <span className="hub-link-kicker">Khách</span>
            <span className="hub-link-title">Gửi lời chúc</span>
            <span className="hub-link-desc">Form gửi wish — in QR từ URL này</span>
          </Link>

          {displayHref ? (
            <Link href={displayHref} className="hub-link">
              <span className="hub-link-kicker">LED</span>
              <span className="hub-link-title">Màn hình chính</span>
              <span className="hub-link-desc">Wish wall 3D + kích hoạt keymoment</span>
            </Link>
          ) : (
            <div className="hub-link hub-link-disabled" role="status">
              <span className="hub-link-kicker">LED</span>
              <span className="hub-link-title">Màn hình chính</span>
              <span className="hub-link-desc">
                Chưa có DISPLAY_SECRET — thêm vào .env.local rồi restart
              </span>
            </div>
          )}
        </nav>
      </div>
    </main>
  );
}
