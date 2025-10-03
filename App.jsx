import React, { useState } from "react";
import Tabs from "./components/Tabs";
import Interviewer from "./components/Interviewer";
import Interviewee from "./components/Interviewee";

const App = () => {
    const [activeTab, setActiveTab] = useState("Interviewer");

    return (
        <div style={{ padding: 20, fontFamily: "Arial" }}>
            <h1>Interview Dashboard</h1>
            <Tabs activeTab={activeTab} setActiveTab={setActiveTab} />
            <div style={{ marginTop: 20 }}>
                {activeTab === "Interviewer" ? <Interviewer /> : <Interviewee />}
            </div>
        </div>
    );
};

export default App;
