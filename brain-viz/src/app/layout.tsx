import { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brain Viz - Your Neural Knowledge Network",
  description: "Visualize your knowledge stored in nkn.db as a neuronal network",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ backgroundColor: "#0a0a0a", color: "#fff", margin: 0 }}>{children}</body>
    </html>
  );
}