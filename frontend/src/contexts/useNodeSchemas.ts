import { useContext } from "react";
import { NodeSchemasContext } from "./nodeSchemasContext";

export const useNodeSchemas = () => useContext(NodeSchemasContext);
