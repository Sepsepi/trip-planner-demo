# Trip Planner Demo

AI-powered road trip planner with real-time itinerary generation, interactive maps, and activity recommendations.

## Features

- AI trip planning with GPT-4 (budget, distance, time optimization)
- Interactive maps with custom activity markers
- Real-time AI streaming (watch it think)
- 150+ activities across 5 East Coast cities
- Trip finalizer with hours, prices, reviews, booking links
- WebSocket debug console

## Tech Stack

Frontend: React 18, MapLibre GL JS, Tailwind CSS
Backend: Node.js, Express, WebSocket
AI: OpenAI GPT-4 Turbo
Maps: CartoDB Light tiles

## Local Setup

1. Install dependencies:
```bash
npm install
```

2. Add `.env` file:
```
OPENAI_API_KEY=your-key-here
PORT=3000
```

3. Run:
```bash
npm start
```

4. Open: `http://localhost:3000/airbnb-map-demo.html`

## Deploy on Render.com

### Why Render?
- Free tier ✅
- WebSocket support ✅ (debug console works)
- No sleep with UptimeRobot ping

### Steps:

1. **Push to GitHub**
2. **Go to render.com** → Sign in → New Web Service
3. **Connect repo**: Select your GitHub repo
4. **Configure:**
   - Name: trip-planner-demo
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
5. **Add Environment Variable:**
   - Key: `OPENAI_API_KEY`
   - Value: your OpenAI key
6. **Deploy** → Wait ~2 mins

### Keep It Awake (Free):

1. Go to **uptimerobot.com** → Add Monitor
2. Type: HTTP(s)
3. URL: Your Render URL
4. Interval: 10 minutes
5. Done - never sleeps

## Files

```
demo/
├── airbnb-map-demo.html    Frontend
├── server.js               Backend + WebSocket
├── data-real-world.js      Activity database
├── package.json            Dependencies
└── .env                    API keys (gitignored)
```

## How It Works

1. User enters destination
2. AI finds hotels & activities
3. User selects hotel → AI generates itinerary
4. Trip finalizer shows all details with booking links
5. Debug console shows AI thinking in real-time

## License

MIT
