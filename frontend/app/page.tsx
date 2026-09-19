import { redirect } from "next/navigation";

export default function Home() {
  // Nothing else is built yet — send straight to the only live surface.
  redirect("/settings/wallets");
}
