const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const cors = require("cors");
require("dotenv").config();
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 4000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -------------------
// Retry Helper
// -------------------
async function safeChatRequest(params, retries = 3) {
    while (retries > 0) {
        try {
            return await openai.chat.completions.create(params);
        } catch (err) {
            if (err.code === "rate_limit_exceeded" || err.status === 429) {
                const wait = 20000;
                console.warn(`⚠️ Rate limited. Retrying in ${wait / 1000}s...`);
                await new Promise((res) => setTimeout(res, wait));
                retries--;
            } else {
                throw err;
            }
        }
    }
    throw new Error("❌ OpenAI request failed after retries");
}

// -------------------
// Multer setup
// -------------------
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

// In-memory candidate storage
const candidates = {};

app.listen(PORT, () => {
    console.log(`✅ Backend running at http://localhost:${PORT}`);
});

// -------------------
// Resume Extraction
// -------------------
app.post("/api/resume/extract", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        let text = "";
        const filePath = req.file.path;

        if (req.file.mimetype === "application/pdf") {
            const buffer = fs.readFileSync(filePath);
            const pdfData = await pdfParse(buffer);
            text = pdfData.text;
        } else {
            const docData = await mammoth.extractRawText({ path: filePath });
            text = docData.value;
        }

        fs.unlinkSync(filePath);

        const nameMatch = text.match(/Name[:\s]*([A-Za-z ]+)/i);
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
        const phoneMatch = text.match(/(\+?\d{1,4}[-.\s]?)?(\d{10})/);

        const candidateInfo = {
            name: nameMatch ? nameMatch[1].trim() : null,
            email: emailMatch ? emailMatch[0] : null,
            phone: phoneMatch ? phoneMatch[0] : null,
        };

        res.json({ extractedText: text, candidateInfo });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error extracting resume" });
    }
});

// -------------------
// Start Interview
// -------------------
app.post("/api/interview/start", async (req, res) => {
    try {
        const { name, skills } = req.body;
        if (!name || !skills)
            return res.status(400).json({ error: "Missing info" });

        // ✅ Generate candidateId here
        const candidateId = `candidate_${Date.now()}`;

        // Initialize candidate state
        candidates[candidateId] = {
            name,
            skills,
            currentQuestionIndex: 0,
            questions: [],
            answers: [],
            totalScore: 0,
        };

        // Generate all 6 questions
        const difficulties = ["Easy", "Easy", "Medium", "Medium", "Hard", "Hard"];
        const questions = [];
        for (const diff of difficulties) {
            const prompt = `You are an AI interviewer. Generate a ${diff} technical interview question for a Full Stack developer skilled in ${skills.join(", ")}. Return only the question text.`;
            const response = await safeChatRequest({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 150,
            });
            questions.push({
                difficulty: diff,
                question: response.choices[0].message.content.trim(),
            });
        }
        candidates[candidateId].questions = questions;

        // Return candidateId with first question
        res.json({
            candidateId,
            question: questions[0].question,
            difficulty: questions[0].difficulty,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to start interview" });
    }
});

// -------------------
// Submit Answer
// -------------------
app.post("/api/interview/answer", async (req, res) => {
    try {
        const { candidateId, answer } = req.body;
        const state = candidates[candidateId];
        if (!state) return res.status(404).json({ error: "Candidate not found" });

        const currentQ = state.questions[state.currentQuestionIndex];

        // ✅ Ensure blank answers become "No answer given"
        const finalAnswer = answer && answer.trim() ? answer.trim() : "No answer given";

        // Evaluate the answer
        const evalPrompt = `Question: ${currentQ.question}\nAnswer: ${finalAnswer}\n\nTask: Evaluate this answer for correctness, completeness, and clarity. Give a score from 0 to 20 and a one-sentence feedback. Respond in JSON like { "score": 15, "feedback": "..." }`;
        const evalResp = await safeChatRequest({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: evalPrompt }],
            max_tokens: 150,
        });

        let score = 0;
        let feedback = "";
        try {
            const parsed = JSON.parse(evalResp.choices[0].message.content.trim());
            score = parsed.score || 0;
            feedback = parsed.feedback || "";
        } catch (err) {
            console.error("Failed to parse json", evalResp.choices[0].message.content);
            console.error("Error parsing json", err);
            score = 10;
            feedback = "Partial answer.";
        }

        // Store answer and update score
        state.answers.push({ question: currentQ.question, answer: finalAnswer, score, feedback });
        state.totalScore += score;
        state.currentQuestionIndex++;

        // Next question or summary
        if (state.currentQuestionIndex < state.questions.length) {
            const nextQ = state.questions[state.currentQuestionIndex];
            res.json({
                nextQuestion: nextQ.question,
                difficulty: nextQ.difficulty,
                score,
                feedback,
            });
        } else {
            // Final summary
            const summaryPrompt = `Candidate Name: ${state.name}\nSkills: ${state.skills.join(", ")}\nScores: ${state.answers.map((a) => `${a.score}/20 for Q: ${a.question}`).join("\n")}\nTotal Score: ${state.totalScore}/120\nTask: Provide a short professional summary of the candidate and a clear hiring recommendation.`;
            const summaryResp = await safeChatRequest({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: summaryPrompt }],
                max_tokens: 250,
            });
            const summaryText = summaryResp.choices[0].message.content.trim();

            res.json({
                nextQuestion: null,
                summary: summaryText,
                finalScore: state.totalScore,
                answers: state.answers,
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error processing answer" });
    }
});
