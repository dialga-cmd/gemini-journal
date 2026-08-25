import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/* Outfit carries display moments (greetings, the login manifesto) per the
   LAMPLIGHT philosophy: clear geometric voice, confident posture. Geist does
   the daily reading. */
const outfitDisplay = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Personal Gemini Journal",
  description: "A private space to journal and brainstorm with Gemini.",
};

/* Browser chrome follows the room: ink at night, paper by day. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#141119" },
    { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${outfitDisplay.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: grammar-checker extensions (Grammarly etc.)
          inject data-* attributes onto <body> before hydration. Scope the
          suppression to this element only — deeper mismatches still warn. */}
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
