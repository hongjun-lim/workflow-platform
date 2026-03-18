import { createContext } from "react";
import type { NodeSchema } from "../api";

export interface NodeSchemasContextType {
  schemas: NodeSchema[];
  loading: boolean;
  refresh: () => void;
}

export const NodeSchemasContext = createContext<NodeSchemasContextType>({
  schemas: [],
  loading: false,
  refresh: () => {},
});
