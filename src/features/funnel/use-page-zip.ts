"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getPreparedPageZip,
  subscribePageZips,
  type PageZipScope,
} from "./page-zip";

const empty = () => null;

export function usePageZip({
  storageId,
  funnelId,
  nodeId,
  productId,
}: PageZipScope) {
  const snapshot = useCallback(
    () => getPreparedPageZip({ storageId, funnelId, nodeId, productId }),
    [storageId, funnelId, nodeId, productId],
  );
  return useSyncExternalStore(subscribePageZips, snapshot, empty);
}
