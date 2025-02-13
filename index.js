const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './frontend')));

// Path to data.json
const dataFile = path.join(__dirname, './questions/data.json');

// Initialize data.json if it doesn't exist
const initializeData = async () => {
    try {
        await fs.ensureFile(dataFile);
        const data = await fs.readJson(dataFile).catch(() => ({
            questions: [],
            practiceLogs: [],
            topics: {
                "Sorting Techniques": {
                    "name": "Sorting Techniques",
                    "description": "Basic and advanced sorting algorithms",
                    "subTopics": ["Basic Sorting", "Quick Sort", "Merge Sort"],
                    "patterns": ["In-place", "Divide & Conquer"]
                },
                "Arrays": {
                    "name": "Arrays",
                    "description": "Array manipulation and algorithms",
                    "subTopics": ["Basic Operations", "Two Pointers", "Sliding Window"],
                    "patterns": ["In-place modification", "Two Pointers"]
                }
            }
        }));
        await fs.writeJson(dataFile, data, { spaces: 2 });
        console.log('Data file initialized successfully');
    } catch (error) {
        console.error('Error initializing data file:', error);
        process.exit(1); // Exit if we can't initialize the data file
    }
};

// Data validation middleware
const validateQuestionData = (req, res, next) => {
    const { title, difficulty, topic, subTopic, link } = req.body;
    
    if (!title || !difficulty || !topic) {
        return res.status(400).json({ 
            error: 'Missing required fields', 
            required: ['title', 'difficulty', 'topic'] 
        });
    }

    const validDifficulties = ['Easy', 'Medium', 'Hard'];
    if (!validDifficulties.includes(difficulty)) {
        return res.status(400).json({ 
            error: 'Invalid difficulty level',
            valid: validDifficulties 
        });
    }

    next();
};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, './frontend/index.html'));
});

app.get('/questions', (req, res) => {
    res.sendFile(path.join(__dirname, './frontend/questions.html'));
});

app.get('/add', (req, res) => {
    res.sendFile(path.join(__dirname, './frontend/add.html'));
});

// API Routes
// Get all data
app.get('/api/data', async (req, res) => {
    try {
        const data = await fs.readJson(dataFile);
        res.json(data);
    } catch (error) {
        console.error('Error reading data:', error);
        res.status(500).json({ error: 'Error reading data' });
    }
});

// Add new question
app.post('/api/questions', validateQuestionData, async (req, res) => {
    try {
        const data = await fs.readJson(dataFile);
        const newQuestion = {
            id: Date.now().toString(),
            dateAdded: new Date().toISOString(),
            status: 'Not Started',
            confidence: 1,
            lastPracticed: null,
            ...req.body
        };

        // Ensure arrays are properly initialized
        newQuestion.tags = Array.isArray(req.body.tags) ? req.body.tags : [];
        newQuestion.commonPitfalls = Array.isArray(req.body.commonPitfalls) ? req.body.commonPitfalls : [];
        newQuestion.approach = Array.isArray(req.body.approach) ? req.body.approach : [];

        data.questions.push(newQuestion);
        await fs.writeJson(dataFile, data, { spaces: 2 });
        
        console.log('Question added successfully:', newQuestion.title);
        res.status(201).json(newQuestion);
    } catch (error) {
        console.error('Error adding question:', error);
        res.status(500).json({ error: 'Error adding question' });
    }
});

// Update question
app.put('/api/questions/:id', validateQuestionData, async (req, res) => {
    try {
        const data = await fs.readJson(dataFile);
        const index = data.questions.findIndex(q => q.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Question not found' });
        }

        data.questions[index] = {
            ...data.questions[index],
            ...req.body,
            lastModified: new Date().toISOString()
        };

        await fs.writeJson(dataFile, data, { spaces: 2 });
        console.log('Question updated successfully:', data.questions[index].title);
        res.json(data.questions[index]);
    } catch (error) {
        console.error('Error updating question:', error);
        res.status(500).json({ error: 'Error updating question' });
    }
});

// Delete question
app.delete('/api/questions/:id', async (req, res) => {
    try {
        const data = await fs.readJson(dataFile);
        const initialLength = data.questions.length;
        data.questions = data.questions.filter(q => q.id !== req.params.id);
        
        if (data.questions.length === initialLength) {
            return res.status(404).json({ error: 'Question not found' });
        }

        await fs.writeJson(dataFile, data, { spaces: 2 });
        console.log('Question deleted successfully');
        res.json({ message: 'Question deleted successfully' });
    } catch (error) {
        console.error('Error deleting question:', error);
        res.status(500).json({ error: 'Error deleting question' });
    }
});

// Add practice log
app.post('/api/practice', async (req, res) => {
    try {
        const data = await fs.readJson(dataFile);
        const { questionId, timeTaken, solvedWithoutHelp, notes } = req.body;

        // Validate practice data
        if (!questionId || !timeTaken) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const question = data.questions.find(q => q.id === questionId);
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        const practiceLog = {
            id: Date.now().toString(),
            questionId,
            timeTaken,
            solvedWithoutHelp,
            notes,
            date: new Date().toISOString()
        };

        data.practiceLogs.push(practiceLog);

        // Update question status
        question.lastPracticed = practiceLog.date;
        question.confidence = Math.min(5, solvedWithoutHelp ? 
            (question.confidence || 0) + 1 : 
            (question.confidence || 0));
        question.status = question.confidence >= 4 ? 'Mastered' : 
                         question.confidence >= 2 ? 'In Progress' : 
                         'Not Started';

        await fs.writeJson(dataFile, data, { spaces: 2 });
        console.log('Practice log added successfully');
        res.status(201).json(practiceLog);
    } catch (error) {
        console.error('Error adding practice log:', error);
        res.status(500).json({ error: 'Error adding practice log' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error', 
        message: err.message 
    });
});

// Initialize and start server
(async () => {
    try {
        await initializeData();
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
            console.log('Available routes:');
            console.log('- / (Home)');
            console.log('- /questions (Questions List)');
            console.log('- /add (Add New Question)');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
})();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});