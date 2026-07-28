import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import PwaSetup from "@/components/PwaSetup";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Guru Biola — Guru privat biola AI",
  description:
    "Belajar biola dari nol sampai Paganini: tuner, latihan intonasi, ear training, metronom, latihan ritme, baca not, dan guru AI real-time.",
  manifest: "manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Guru Biola",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "icon-192.png",
    apple: "icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#16110c",
  // Halaman latihan dipakai sambil megang biola — zoom gak sengaja pas
  // kesenggol dagu/bahu itu ganggu, tapi jangan dikunci total biar yang
  // matanya kurang awas tetap bisa perbesar.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Nav />
        <main className="animate-fade-up mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          <PwaSetup />
          {children}
        </main>
        <footer className="border-t border-border-soft py-4 text-center text-xs text-muted">
          Guru Biola — latihan tiap hari 15 menit ngalahin latihan seminggu
          sekali 2 jam.
        </footer>
      </body>
    </html>
  );
}
