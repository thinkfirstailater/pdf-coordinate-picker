"use client";

import dynamic from "next/dynamic";

const PDFCoordinatePicker = dynamic(
  () => import("@/components/PDFCoordinatePicker"),
  { ssr: false }
);

export default function Home() {
  return <PDFCoordinatePicker />;
}
