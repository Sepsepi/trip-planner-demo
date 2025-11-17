require('dotenv').config();
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const OpenAI = require('openai');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(__dirname));

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// WebSocket clients for debug console
const debugClients = new Set();

// Broadcast log to all debug consoles
function logToDebug(message, level = 'info') {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  const log = {
    timestamp,
    level,
    message
  };

  debugClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(log));
    }
  });

  console.log(`[${timestamp}] ${message}`);
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  debugClients.add(ws);
  logToDebug('Debug console connected', 'success');

  ws.on('close', () => {
    debugClients.delete(ws);
    logToDebug('Debug console disconnected', 'info');
  });
});

// Serve main app at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'airbnb-map-demo.html'));
});

// Serve debug console
app.get('/debug', (req, res) => {
  res.sendFile(path.join(__dirname, 'debug-console.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', openai: !!process.env.OPENAI_API_KEY });
});

// Generate itinerary endpoint
app.post('/api/generate-itinerary', async (req, res) => {
  const { mode, hotel, activities, preferences } = req.body;

  logToDebug(`Received ${mode} itinerary request for ${hotel.name}`, 'info');
  logToDebug(`Preferences: Budget=$${preferences.budget}, Distance=${preferences.maxDistance}mi, Duration=${preferences.duration}`, 'info');

  try {
    // Filter activities by distance and budget
    logToDebug(`Filtering ${activities.length} activities...`, 'info');

    const filtered = activities.filter(activity => {
      const distance = calculateDistance(
        hotel.lat, hotel.lng,
        activity.lat, activity.lng
      );
      return distance <= preferences.maxDistance &&
             (activity.price || 0) <= preferences.budget;
    });

    logToDebug(`Found ${filtered.length} activities within criteria`, 'success');

    // Build prompt based on mode
    const prompt = buildPrompt(mode, hotel, filtered, preferences);
    logToDebug(`Calling OpenAI GPT-4 Turbo...`, 'info');

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const startTime = Date.now();
    let totalTokens = 0;

    // Stream from OpenAI
    const stream = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'Expert trip planner. Format: REASONING: [thoughts] RESULT: [JSON only]'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      stream: true,
    });

    let fullResponse = '';
    let currentSection = '';
    let reasoningBuffer = '';
    let inReasoning = false;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        reasoningBuffer += content;

        // Detect REASONING section
        if (reasoningBuffer.includes('REASONING:') && !inReasoning) {
          inReasoning = true;
          logToDebug('AI started reasoning process...', 'info');
          reasoningBuffer = '';
        }

        // Detect RESULT section (reasoning done)
        if (reasoningBuffer.includes('RESULT:') && inReasoning) {
          inReasoning = false;
          logToDebug('AI completed reasoning, generating itinerary...', 'success');
          reasoningBuffer = '';
        }

        // Log reasoning content in real-time
        if (inReasoning && content.trim()) {
          // Check if we have a complete sentence or thought
          if (content.includes('.') || content.includes('\n')) {
            const sentences = reasoningBuffer.split(/(?<=[.!?])\s+/);
            for (let i = 0; i < sentences.length - 1; i++) {
              const sentence = sentences[i].trim();
              if (sentence && sentence.length > 10) {
                logToDebug(`AI: ${sentence}`, 'info');
              }
            }
            reasoningBuffer = sentences[sentences.length - 1];
          }
        }

        // Send chunk to frontend
        res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
      }
    }

    const duration = Date.now() - startTime;
    logToDebug(`OpenAI response complete (${duration}ms)`, 'success');

    // Extract just the JSON result for frontend
    let jsonResult = fullResponse;
    if (fullResponse.includes('RESULT:')) {
      const parts = fullResponse.split('RESULT:');
      jsonResult = parts[1].trim();

      // Extract reasoning for final summary
      const reasoning = parts[0].replace('REASONING:', '').trim();
      if (reasoning) {
        logToDebug(`AI reasoning summary: ${reasoning.substring(0, 200)}...`, 'success');
      }
    }

    // Send completion event
    res.write(`data: ${JSON.stringify({ type: 'done', response: jsonResult })}\n\n`);
    res.end();

    logToDebug(`Itinerary generated successfully`, 'success');

  } catch (error) {
    logToDebug(`Error: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Build prompt based on mode
function buildPrompt(mode, hotel, activities, preferences) {
  // Optimize: Only send essential fields to reduce token usage
  // Remove: reviews count, price_range (redundant with price), long descriptions
  const activityList = activities.map(a =>
    `${a.name} | ${a.type} | $${a.price || 0} | ${a.rating}★`
  ).join('\n');

  if (mode === 'quick') {
    return `Activities near ${hotel.name}:
${activityList}

Budget: $${preferences.budget} | Max distance: ${preferences.maxDistance}mi | Time: ${preferences.duration}

Think step-by-step, then recommend 5 best activities.

Format:
REASONING: [brief thoughts on selection criteria, variety, and budget fit]
RESULT: [{"name":"...","type":"...","time_needed_minutes":90,"why_chosen":"..."}]

Output ONLY JSON after RESULT: - no extra text.`;
  } else {
    // Full itinerary mode
    const durationMinutes = preferences.duration === 'Full Day' ? 480 :
                           preferences.duration === 'Half Day' ? 240 : 180;

    return `Itinerary from ${hotel.name}:

Activities:
${activityList}

Budget: $${preferences.budget} | Distance: ${preferences.maxDistance}mi | Duration: ${durationMinutes}min | Start: 9AM

Plan an efficient route with no backtracking. Consider grouping, timing, budget, and travel.

Format:
REASONING: [routing logic, time allocation, budget strategy, trade-offs]
RESULT: [{"time":"9:00 AM","activity":"...","type":"...","duration_minutes":90,"travel_time_minutes":10,"cost":25,"notes":"..."}]

Output ONLY JSON after RESULT: - no extra text or markdown.`;
  }
}

// Calculate distance using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket debug server running on ws://localhost:${PORT}`);
  logToDebug(`Server started on port ${PORT}`, 'success');
});
