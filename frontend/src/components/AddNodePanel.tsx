import { useContext, useRef } from "react";
import { useClientContext } from "@flowgram.ai/free-layout-editor";
import { nodeTypesList } from "../constants/nodeTypes";
import { NodeSelectionContext } from "../contexts/NodeSelectionContext";

export const AddNodePanel = () => {
  const context = useClientContext();
  const nodeSelectionContext = useContext(NodeSelectionContext);
  const nodeIdRef = useRef(2);

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
      {nodeTypesList.map((node) => (
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
