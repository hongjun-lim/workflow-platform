import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { getNodeSchemas } from "../api";
import type { NodeSchema } from "../api";
import { NodeSchemasContext } from "./nodeSchemasContext";

export const NodeSchemasProvider = ({ children }: { children: ReactNode }) => {
  const [schemas, setSchemas] = useState<NodeSchema[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getNodeSchemas();
      setSchemas(data ?? []);
    } catch (e) {
      console.error("Failed to load node schemas", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <NodeSchemasContext.Provider value={{ schemas, loading, refresh }}>
      {children}
    </NodeSchemasContext.Provider>
  );
};
