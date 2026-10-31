import { useState } from "react";

// Quick filter strip shown above the staff table.
export default function QuickFilterBar({ onChange }) {
  const [text, setText] = useState("");

  return (
    <div style={{ width: 520, display: "flex", gap: 6, alignItems: "center" }}>
      <input
        value={text}
        placeholder="Filter"
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
        style={{ outline: "none", width: 300, height: 28 }}
      />
      <span
        onClick={() => {
          setText("");
          onChange("");
        }}
        style={{ cursor: "pointer", width: 16, height: 16, fontSize: 11, color: "#fff", background: "#ffb27a", textAlign: "center" }}
      >
        x
      </span>
      <div onClick={() => onChange("__star__")} style={{ cursor: "pointer", fontSize: 12 }}>
        ★
      </div>
    </div>
  );
}
