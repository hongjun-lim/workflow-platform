import { useContext, useRef, useMemo } from "react";
import { useClientContext } from "@flowgram.ai/free-layout-editor";
import { nodeTypesList } from "../constants/nodeTypes";
import { NodeSelectionContext } from "../contexts/NodeSelectionContext";
import { useNodeSchemas } from "../contexts/useNodeSchemas";

export const AddNodePanel = () => {
  const context = useClientContext();
  const nodeSelectionContext = useContext(NodeSelectionContext);
  const nodeIdRef = useRef(2);
  const { schemas } = useNodeSchemas();

  // Merge: start from hardcoded list, override icon/label with API data,
  // then append any custom (non-builtin) schemas not already in the list.
  const mergedNodes = useMemo(() => {
    const schemaMap = new Map(schemas.map((s) => [s.type, s]));

    // Override icon/label for existing types
    const updated = nodeTypesList.map((n) => {
      const api = schemaMap.get(n.type);
      return api ? { ...n, icon: api.icon, label: api.label } : n;
    });

    // Append custom nodes from API that aren't in the hardcoded list
    const builtinTypes = new Set(nodeTypesList.map((n) => n.type));
    const custom = schemas
      .filter((s) => !builtinTypes.has(s.type))
      .map((s) => ({ type: s.type, label: s.label, icon: s.icon }));

    return [...updated, ...custom];
  }, [schemas]);

  const handleAddNode = (type: string, label: string) => {
    try {
      const nodeId = `${type}-${nodeIdRef.current}`;
      const position = {
        x: 100 + ((nodeIdRef.current - 1) % 3) * 350,
        y: 100 + Math.floor((nodeIdRef.current - 1) / 3) * 180,
      };

      context.document.createWorkflowNodeByType(type, position, {
        id: nodeId,
        data: { title: label },
      });

      nodeIdRef.current += 1;
      nodeSelectionContext?.markAsChanged();
    } catch (error) {
      console.error("Failed to add node:", error);
    }
  };

  return (
    <div className="section">
      <h3>Add Node</h3>
      {mergedNodes.map((node) => (
        <button
          key={node.type}
          onClick={() => handleAddNode(node.type, node.label)}
          className="node-btn"
        >
          {node.icon} {node.label}
        </button>
      ))}
    </div>
  );
};
