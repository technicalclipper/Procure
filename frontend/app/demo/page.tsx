import type { Metadata } from "next";
import { Deck } from "./deck";

export const metadata: Metadata = {
  title: "Procure — the approval is the payment",
  description:
    "Crypto-native procure-to-pay. An invoice that doesn't match the purchase order cannot be paid.",
};

export default function DemoPage() {
  return <Deck />;
}
