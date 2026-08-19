import { createRoot } from "react-dom/client";
import GuPanApp from "../app/GuPanApp";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("GuPan 앱을 표시할 #root 요소를 찾지 못했습니다.");
}

createRoot(root).render(<GuPanApp />);
