import { createContext } from "react";
import type { FlowNodeEntity } from "@flowgram.ai/free-layout-editor";

export const NodeSelectionContext = createContext<{
  setSelectedNode: (node: FlowNodeEntity | null) => void;
  openDryRun: (node: FlowNodeEntity) => void;
} | null>(null);
