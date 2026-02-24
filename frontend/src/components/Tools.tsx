import { usePlaygroundTools } from "@flowgram.ai/free-layout-editor";

export const Tools = () => {
  const tools = usePlaygroundTools();

  const buttonStyle = {
    border: "1px solid rgba(28, 31, 35, 0.15)",
    borderRadius: 6,
    cursor: "pointer",
    padding: "8px 12px",
    color: "#1c1f23",
    background: "#fff",
    fontSize: 13,
    fontWeight: 500 as const,
    transition: "all 0.2s ease",
  };

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 10,
        bottom: 20,
        right: 20,
        display: "flex",
        gap: 8,
        background: "#fff",
        padding: 8,
        borderRadius: 10,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
      }}
    >
      <button style={buttonStyle} onClick={() => tools.zoomin()}>
        ➕
      </button>
      <button style={buttonStyle} onClick={() => tools.zoomout()}>
        ➖
      </button>
      <span
        style={{
          ...buttonStyle,
          cursor: "default",
          minWidth: 50,
          textAlign: "center" as const,
        }}
      >
        {Math.floor(tools.zoom * 100)}%
      </span>
      <button style={buttonStyle} onClick={() => tools.fitView()}>
        ⛶ Fit
      </button>
      <button style={buttonStyle} onClick={() => tools.autoLayout()}>
        📐 Auto
      </button>
    </div>
  );
};
