import { Routes, Route } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { Test } from "./pages/Test";
import { Results } from "./pages/Results";
import { Scoreboard } from "./pages/Scoreboard";
import { Admin } from "./pages/Admin";

export default function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/test" element={<Test />} />
        <Route path="/results" element={<Results />} />
        <Route path="/scoreboard" element={<Scoreboard />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </div>
  );
}
