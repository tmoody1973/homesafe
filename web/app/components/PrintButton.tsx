"use client";

import { Button } from "@heroui/react";

export function PrintButton() {
  return (
    <Button className="print:hidden" onPress={() => window.print()} size="sm">
      Print or save as PDF
    </Button>
  );
}
