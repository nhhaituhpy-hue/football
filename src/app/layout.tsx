import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lịch Thi Đấu World Cup 2026 | Livescore",
  description: "Cập nhật lịch thi đấu chính thức, tỉ số trực tuyến, bảng xếp hạng 12 bảng đấu",
  keywords: ["world cup 2026", "lịch thi đấu world cup", "livescore world cup", "world cup realtime"],
  authors: [{ name: "Nguyễn Hoàng Hải" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "World Cup 2026",
  },
};

export const viewport: Viewport = {
  themeColor: "#0078d4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} h-full antialiased`}
      style={{ colorScheme: 'dark' }}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(reg) { console.log('SW registered:', reg); })
                    .catch(function(err) { console.warn('SW failed:', err); });
                });
              }
            `
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col bg-background text-foreground font-sans">
        <Navbar />
        <main className="flex-1 flex flex-col w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
