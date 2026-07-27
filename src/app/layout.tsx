import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

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
    "Belajar biola dari nol sampai Paganini: tuner, latihan intonasi, ear training, kurikulum, dan guru AI real-time.",
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
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
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
