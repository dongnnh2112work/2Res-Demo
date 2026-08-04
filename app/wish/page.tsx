import WishForm from "@/components/wish/WishForm";

export const metadata = {
  title: "Gửi lời chúc",
  description: "Viết lời chúc gửi gắm đến sự kiện",
};

export default function WishPage() {
  return (
    <main className="wish-page">
      <div className="wish-atmosphere" aria-hidden />
      <div className="wish-shell">
        <header className="wish-brand">
          <p className="wish-brand-name">Wish Wall</p>
          <h1 className="wish-headline">Gửi lời chúc</h1>
          <p className="wish-sub">
            Lời chúc của bạn sẽ hiện realtime trên màn hình chính.
          </p>
        </header>
        <WishForm />
      </div>
    </main>
  );
}
