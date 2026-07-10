import { redirect } from "next/navigation";

// The app shell guard bounces unauthenticated visitors to /login.
export default function Home() {
  redirect("/chat");
}
