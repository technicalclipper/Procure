import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Nav } from "./nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Procure",
  description: "Crypto-native procurement. The approval is the payment.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div className="flex min-h-screen">
          <aside className="w-60 shrink-0 border-r border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-5">
              <Link href="/" className="block">
                <div className="text-[15px] font-semibold tracking-tight">Procure</div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Northwind Labs
                </div>
              </Link>
            </div>
            <Nav />
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
