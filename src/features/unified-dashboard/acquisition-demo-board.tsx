"use client";

import { useMemo } from "react";
import { createAcquisitionDemoSource } from "./acquisition-demo-data";
import { useUnifiedDashboard } from "./operation-provider";
import { TrafficBoard } from "./traffic-board";

/** Explicit preview requested by the owner; never a live-data fallback. */
export function AcquisitionDemoBoard() {
  const { year, month, operationId } = useUnifiedDashboard();
  const source = useMemo(
    () => createAcquisitionDemoSource(year, month, operationId),
    [year, month, operationId],
  );
  return <TrafficBoard source={source} />;
}
