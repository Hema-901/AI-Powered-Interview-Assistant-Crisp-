import React, { useState, useRef } from "react";

const difficultyTimers = { Easy: 20, Medium: 60, Hard: 120 };

const Interviewee = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [resumeData, setResumeData] = useState({});
    const [missingFields, setMissingFields] = useState([]);
    const [chatIndex, setChatIndex] = useState(0);
    const [userInput, setUserInput] = useState("");
    const [chatLog, setChatLog] = useState([]);
    const [candidateId, setCandidateId] = useState("");
    const candidateIdRef = useRef(null);
    const [currentQuestion, setCurrentQuestion] = useState("");
    const [currentDifficulty, setCurrentDifficulty] = useState("");
    const [timer, setTimer] = useState(0);
    const countdownRef = useRef(null);
    const timeoutRef = useRef(null);
    const [finalScore, setFinalScore] = useState(null);
    const [summary, setSummary] = useState("");
    const [answers, setAnswers] = useState([]);

    // File selection
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return alert("File size exceeds 5MB");
        setSelectedFile(file);
    };

    // Upload resume
    const handleUpload = async () => {
        if (!selectedFile) return alert("Please select a file first");
        setUploading(true);
        const formData = new FormData();
        formData.append("file", selectedFile);

        try {
            const res = await fetch("http://localhost:4000/api/resume/extract", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            setResumeData(data.candidateInfo);

            const missing = [];
            if (!data.candidateInfo.name) missing.push("name");
            if (!data.candidateInfo.email) missing.push("email");
            if (!data.candidateInfo.phone) missing.push("phone");
            setMissingFields(missing);

            if (missing.length > 0) {
                setChatLog(["AI: Hello! I need some missing info before the interview."]);
            } else {
                setChatLog(["AI: All info detected. Ready to start!"]);
            }
        } catch (err) {
            console.error(err);
            alert("Upload failed");
        } finally {
            setUploading(false);
        }
    };

    // Missing info chat
    const handleChatSubmit = () => {
        if (!userInput) return;
        const field = missingFields[chatIndex];
        const updatedData = { ...resumeData, [field]: userInput };
        setResumeData(updatedData);
        setChatLog((prev) => [...prev, `You: ${userInput}`]);
        setUserInput("");

        if (chatIndex + 1 < missingFields.length) {
            setChatIndex(chatIndex + 1);
            setChatLog((prev) => [
                ...prev,
                `AI: Please enter your ${missingFields[chatIndex + 1]}:`,
            ]);
        } else {
            setChatIndex(chatIndex + 1);
            setMissingFields([]);
            setChatLog((prev) => [...prev, "AI: Thanks! Ready to start the interview."]);
        }
    };

    // Start interview
    const startInterview = async () => {
        try {
            const res = await fetch("http://localhost:4000/api/interview/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: resumeData.name,
                    skills: ["React", "Node.js", "JavaScript"],
                }),
            });
            const data = await res.json();

            // ✅ Use backend-generated candidateId
            setCandidateId(data.candidateId);
            candidateIdRef.current = data.candidateId;

            setCurrentQuestion(data.question);
            setCurrentDifficulty(data.difficulty);
            setChatLog((prev) => [...prev, `AI: ${data.question}`]);
            startTimer(data.difficulty);
        } catch (err) {
            console.error(err);
        }
    };

    // Clear timers safely
    const clearTimers = () => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    };

    // Submit answer
    const submitAnswer = async (givenAnswer = null) => {
        clearTimers();

        // ✅ Use givenAnswer if provided, else take userInput, else "No answer given"
        const answer = givenAnswer !== null ? givenAnswer : userInput.trim() || "No answer given";

        // Clear input immediately
        setUserInput("");

        try {
            const res = await fetch("http://localhost:4000/api/interview/answer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ candidateId: candidateIdRef.current, answer }),
            });
            const data = await res.json();

            if (data.nextQuestion) {
                setAnswers((prev) => [...prev, { answer, score: data.score, feedback: data.feedback }]);
                setCurrentQuestion(data.nextQuestion);
                setCurrentDifficulty(data.difficulty);
                setChatLog((prev) => [
                    ...prev,
                    `You: ${answer}`,
                    `AI: ${data.nextQuestion}`,
                    //`Feedback: Score: ${data.score}, Feedback: ${data.feedback}`,  // Feedback separated
                ]);
                startTimer(data.difficulty);
            } else {
                setAnswers(data.answers || []);
                setFinalScore(data.finalScore);
                setSummary(data.summary);
                setCurrentQuestion("");
                setChatLog((prev) => [...prev, `You: ${answer}`, "AI: Interview completed!"]);
            }

        } catch (err) {
            console.error(err);
        }
    };

// Timer setup
    const startTimer = (difficulty) => {
        clearTimers();
        const duration = difficultyTimers[difficulty];
        setTimer(duration);

        // Countdown for UI
        let timeLeft = duration;
        countdownRef.current = setInterval(() => {
            timeLeft -= 1;
            setTimer(timeLeft);
            if (timeLeft <= 0) clearInterval(countdownRef.current);
        }, 1000);

        // Auto-submit after duration
        timeoutRef.current = setTimeout(() => {
            submitAnswer("No answer given"); // ✅ explicitly pass
        }, duration * 1000);
    };

    return (
        <div style={{ padding: 20, maxWidth: 700, margin: "0 auto" }}>
            <h2>Resume Upload & AI Interview</h2>

            {!chatLog.length && (
                <>
                    <input type="file" accept=".pdf,.docx" onChange={handleFileChange} />
                    <button
                        onClick={handleUpload}
                        disabled={uploading}
                        style={{ marginLeft: 10 }}
                    >
                        {uploading ? "Uploading..." : "Upload"}
                    </button>
                </>
            )}

            {chatLog.length > 0 && (
                <div
                    style={{
                        marginTop: 20,
                        border: "1px solid #ccc",
                        padding: 15,
                        borderRadius: 5,
                    }}
                >
                    {chatLog.map((msg, idx) => (
                        <div key={idx} style={{ marginBottom: 8 }}>
                            {msg}
                        </div>
                    ))}

                    {/* Missing fields */}
                    {chatIndex < missingFields.length && (
                        <div style={{ marginTop: 10 }}>
                            <input
                                type="text"
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                placeholder={`Enter your ${missingFields[chatIndex]}`}
                            />
                            <button onClick={handleChatSubmit} style={{ marginLeft: 10 }}>
                                Submit
                            </button>
                        </div>
                    )}

                    {/* Start */}
                    {!currentQuestion && chatIndex >= missingFields.length && !finalScore && (
                        <div style={{ marginTop: 10 }}>
                            <h3>Collected Information:</h3>
                            <p>
                                <strong>Name:</strong> {resumeData.name}
                            </p>
                            <p>
                                <strong>Email:</strong> {resumeData.email}
                            </p>
                            <p>
                                <strong>Phone:</strong> {resumeData.phone}
                            </p>
                            <button onClick={startInterview}>Start Interview</button>
                        </div>
                    )}

                    {/* Q&A */}
                    {currentQuestion && (
                        <div style={{ marginTop: 10 }}>
                            <p>
                                <strong>Time Remaining:</strong> {timer}s ({currentDifficulty})
                            </p>
                            <textarea
                                rows={3}
                                style={{ width: "100%" }}
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                placeholder="Type your answer..."
                            />
                            <button onClick={() => submitAnswer()} style={{ marginTop: 5 }}>
                                Submit Answer
                            </button>
                        </div>
                    )}

                    {/* Final */}
                    {finalScore !== null && (
                        <div style={{ marginTop: 20 }}>
                            <h3>Interview Completed</h3>
                            <p>
                                <strong>Final Score:</strong> {finalScore}/120
                            </p>
                            <p>
                                <strong>AI Summary:</strong> {summary}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Interviewee;
