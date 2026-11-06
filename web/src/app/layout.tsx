import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "InForce: which banking rule applies on a date",
  description: "Answers about OSFI guidelines that know which version is in force, drafted, phased or grandfathered.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="page">{children}</main>
        <footer className="footer">
          Passages are paraphrased summaries for demonstration, not official text. Always check the linked source.
        </footer>
      </body>
    </html>
  );
}
