// ai_call_center_server.js
const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Add CORS headers for cross-origin requests
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});

// Serve static files (CSS, JS, images)
app.use(express.static('public'));

// Configuration
const NGROK_URL = process.env.NGROK_URL || 'https://d0d21d7d1afe.ngrok-free.app';
const LOG_FILE = path.join(__dirname, 'logs.json');

// Twilio credentials
// require('dotenv').config(); // Add this line at the top

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// Load logs from file
let callLogs = [];
if (fs.existsSync(LOG_FILE)) {
    try {
        const data = fs.readFileSync(LOG_FILE);
        callLogs = JSON.parse(data);
        console.log(`✅ Loaded ${callLogs.length} logs from logs.json`);
    } catch (err) {
        console.error('❌ Error reading logs.json:', err.message);
    }
} else {
    fs.writeFileSync(LOG_FILE, JSON.stringify([]));
}

let userSessions = {};

// Serve dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Test route
app.get('/test', (req, res) => {
    res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});

// Handle voice input
app.post('/voice', (req, res) => {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    const callSid = req.body.CallSid;
    const userInput = req.body.SpeechResult || req.body.Digits;

    if (!userSessions[callSid]) {
        userSessions[callSid] = {
            step: 'name', name: null, email: null, age: null,
            location: null, introduction: null, retryCount: 0
        };
    }

    const session = userSessions[callSid];

    const gatherStep = (prompt, nextStep) => {
        const gather = twiml.gather({
            input: 'speech dtmf', timeout: 25, speechTimeout: 'auto',
            speechModel: 'phone_call', enhanced: true,
            language: 'en-US', action: '/voice', method: 'POST'
        });
        gather.say({ voice: 'Polly.Matthew', language: 'en-US' }, prompt);
        session.step = nextStep;
    };

    switch (session.step) {
        case 'name':
            if (!userInput) {
                gatherStep('Hello! Please say your full name after the beep.', 'name');
                break;
            }
            session.name = userInput;
            gatherStep(`Thank you ${userInput}. Now please tell your email address clearly.`, 'email');
            break;

        case 'email':
            if (!userInput) {
                gatherStep('Please say your email address slowly and clearly.', 'email');
                break;
            }
            session.email = userInput;
            gatherStep('Great! Now please tell me your age clearly.', 'age');
            break;

        case 'age':
            if (!userInput) {
                gatherStep('Please say your age clearly.', 'age');
                break;
            }
            session.age = userInput;
            gatherStep('Perfect! Now please say your city and state or country clearly.', 'location');
            break;

        case 'location':
            if (!userInput) {
                gatherStep('Please say your current location.', 'location');
                break;
            }
            session.location = userInput;
            gatherStep('Finally, give a short introduction about yourself.', 'introduction');
            break;

        case 'introduction':
            if (!userInput) {
                gatherStep('Please give your introduction again.', 'introduction');
                break;
            }
            session.introduction = userInput;
            const logEntry = {
                from: req.body.From,
                name: session.name,
                email: session.email,
                age: session.age,
                location: session.location,
                introduction: session.introduction,
                time: new Date().toISOString(),
                callSid: callSid
            };
            callLogs.push(logEntry);
            fs.writeFileSync(LOG_FILE, JSON.stringify(callLogs, null, 2));

            twiml.say(`Excellent! Thank you ${session.name}. Your info is recorded. Goodbye!`);
            twiml.hangup();
            delete userSessions[callSid];
            break;

        default:
            twiml.say('Unexpected error. Please call again.');
            twiml.hangup();
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

// Logs
app.get('/logs', (req, res) => {
    res.json({
        success: true,
        totalCalls: callLogs.length,
        calls: callLogs,
        timestamp: new Date().toISOString()
    });
});

// Make call
app.get('/call-me', (req, res) => {
    if (NGROK_URL.includes('your-ngrok-url')) {
        return res.status(400).json({ error: 'Ngrok URL not configured properly' });
    }
    client.calls.create({
        url: `${NGROK_URL}/voice`,
        to: '+918106817727',
        from: '+16089678356'
    }).then(call => {
        res.json({ success: true, callSid: call.sid });
    }).catch(error => {
        res.status(500).json({ success: false, error: error.message });
    });
});

// Start server
const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
    console.log(`✅ AI Call Center Server running on port ${PORT}`);
});

