import React from "react";

const Tabs = ({ activeTab, setActiveTab }) => {
    return (
        <div style={{ marginBottom: "20px" }}>
            <button
                onClick={() => setActiveTab("Interviewer")}
                style={{
                    padding: "10px 20px",
                    marginRight: "10px",
                    backgroundColor: activeTab === "Interviewer" ? "#4caf50" : "#ccc",
                    color: activeTab === "Interviewer" ? "#fff" : "#000",
                    border: "none",
                    cursor: "pointer",
                }}
            >
                Interviewer
            </button>
            <button
                onClick={() => setActiveTab("Interviewee")}
                style={{
                    padding: "10px 20px",
                    backgroundColor: activeTab === "Interviewee" ? "#4caf50" : "#ccc",
                    color: activeTab === "Interviewee" ? "#fff" : "#000",
                    border: "none",
                    cursor: "pointer",
                }}
            >
                Interviewee
            </button>
        </div>
    );
};

export default Tabs;
