import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Procure",
  description: "Crypto-native procurement. The approval is the payment.",
};

const NAV = [
  { group: "Buy", links: [
    { href: "/requests", label: "Requests" },
    { href: "/orders", label: "Purchase orders" },
    { href: "/bills", label: "Bills" },
    { href: "/payments", label: "Payments" },
  ]},
  { group: "Master data", links: [
    { href: "/vendors", label: "Vendors" },
    { href: "/items", label: "Items" },
    { href: "/accounts", label: "Chart of accounts" },
  ]},
  { group: "Finance", links: [
    { href: "/ledger", label: "Journal" },
    { href: "/trial-balance", label: "Trial balance" },
  ]},
  { group: "Settings", links: [
    { href: "/settings/wallets", label: "Wallets & budgets" },
    { href: "/settings/outbox", label: "Outbox" },
  ]},
];

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
            <nav className="space-y-5 px-3 py-4">
              {NAV.map((section) => (
                <div key={section.group}>
                  <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {section.group}
                  </div>
                  <ul className="space-y-0.5">
                    {section.links.map((l) => (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          className="block rounded-md px-2 py-1.5 text-[13px] text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                        >
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
