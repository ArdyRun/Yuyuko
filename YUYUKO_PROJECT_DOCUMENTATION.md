# Yuyuko Bot - Technical Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Project Structure](#project-structure)
3. [Core Architecture](#core-architecture)
4. [Command System](#command-system)
5. [Utility Modules](#utility-modules)
6. [Data Models](#data-models)
7. [API Integrations](#api-integrations)
8. [Known Issues and Fixes](#known-issues-and-fixes)
9. [Configuration](#configuration)

## Project Overview

Yuyuko Bot is a Discord bot designed for Japanese language learners to track their immersion activities. The bot features Ayumi, a friendly AI assistant powered by Google's Gemini AI, along with comprehensive logging for various media types with automatic metadata fetching, rich statistics, and community features.

### Key Features
- **Ayumi AI Assistant**: Conversational AI with personality and context awareness
- **Immersion Tracking**: Support for multiple media types (anime, manga, books, visual novels, etc.)
- **Automatic Metadata Fetching**: Integration with YouTube, VNDB, and AniList APIs
- **Rich Statistics**: Points system, streak tracking, and data visualization
- **Community Features**: Leaderboards and rankings
- **Content Discovery**: Light novel and subtitle search/download capabilities

## Project Structure

```
yuyuko-bot/
├── commands/              # Slash commands implementation
│   ├── downNovel.js       # Light novel download functionality
│   ├── downSubs.js        # Subtitle download functionality
│   ├── export.js          # Data export functionality
│   ├── geminiReply.js     # Ayumi AI chat functionality
│   ├── help.js            # Help command with usage guide
│   ├── immersion.js       # Main immersion logging command
│   ├── leaderboard.js     # Leaderboard and ranking system
│   ├── log.js             # Log viewing and management
│   ├── react.js           # Message reaction functionality
│   └── stat.js            # Statistics and visualization
├── firebase/              # Firebase configuration and utilities
│   └── firestore.js       # Firestore database connection
├── ranked/                # Role ranking system
│   └── checkRank.js       # Rank checking functionality
├── role-rank/             # Go-based role assignment system
├── rss/                   # RSS feed utilities
│   ├── fakeRss.js         # RSS feed simulation
│   └── parseRss.js        # RSS parsing functionality
├── utils/                 # Helper functions and API integrations
│   ├── anilistAPI.js      # AniList API integration
│   ├── config.js          # Configuration constants
│   ├── emojis.js          # Emoji management
│   ├── formatters.js      # Data formatting utilities
│   ├── generateHeatmapImage.js  # Heatmap visualization
│   ├── getCoverImage.js   # Media cover image retrieval
│   ├── getSubtitle.js     # Subtitle fetching
│   ├── jimaku.js          # Jimaku API integration
│   ├── novelList.json     # Light novel database
│   ├── points.js          # Points calculation system
│   ├── streak.js          # Streak tracking logic
│   ├── vndbAPI.js         # VNDB API integration
│   └── youtube.js         # YouTube API integration
├── .env                   # Environment variables (not in repo)
├── environment.js         # Environment variable loading
├── index.js               # Main bot entry point
├── sync.js                # Synchronization utilities
└── package.json           # Dependencies and scripts
```

## Core Architecture

### Main Entry Point (index.js)
The main entry point initializes the Discord client, loads commands, and handles events.

**Key Responsibilities:**
- Initialize Discord client with required intents
- Load and register all command files
- Deploy commands to all guilds
- Handle interaction events (slash commands, buttons)
- Handle message events (Ayumi AI chat)
- Error handling and process management

**Event Handlers:**
- `ready`: Deploy commands when bot comes online
- `interactionCreate`: Process slash commands and button interactions
- `messageCreate`: Handle Ayumi AI chat and quiz tracking
- `unhandledRejection`/`uncaughtException`: Global error handling

### Firebase Integration (firebase/firestore.js)
Handles all database operations using Firebase Cloud Firestore.

**Features:**
- User data storage
- Immersion log storage
- Statistics tracking
- Leaderboard data

## Command System

### /immersion
Primary command for logging immersion activities.

**Parameters:**
- `media_type`: Type of media (anime, manga, visual_novel, etc.)
- `amount`: Quantity of immersion (pages, episodes, minutes, etc.)
- `title`: Media title (supports autocomplete)
- `comment`: Optional notes
- `date`: Custom date (YYYY-MM-DD format)

**Features:**
- Automatic metadata fetching for YouTube, VNDB, AniList
- Points calculation based on media type
- Streak tracking
- Data visualization integration

### /stat
Displays user statistics with visualization options.

**Parameters:**
- `visual_type`: Chart type (barchart, heatmap)
- `days`: Time range for bar chart
- `year`: Year for heatmap

**Features:**
- Points summary by media type
- Session tracking
- Streak display
- Interactive charts and heatmaps

### /log
View and manage immersion logs.

**Parameters:**
- `timeframe`: Time range (24h, 7d)

**Features:**
- Interactive pagination
- Delete functionality
- Detailed log information
- Media type filtering

### /leaderboard
View community rankings.

**Parameters:**
- `timestamp`: Ranking period (weekly, monthly, etc.)
- `media_type`: Media filter
- `month`/`year`: Specific time period

### /help
Display usage guide.

**Parameters:**
- `language`: Guide language (id/en)

### /novel
Search and download light novels.

**Parameters:**
- `title`: Novel title (Japanese characters)

### /subs
Search and download anime subtitles.

**Parameters:**
- `name`: Anime name
- `episode`: Episode number

### /react
Add animated reactions to messages.

**Parameters:**
- `message`: Message ID or link

### Ayumi AI Integration
Two methods to interact with Ayumi:
- `@Yuyuko Bot [message]` (mention)
- `a!ayumi [message]` (prefix command)

## Utility Modules

### API Integrations
- **anilistAPI.js**: Anime/manga data from AniList
- **vndbAPI.js**: Visual novel data from VNDB
- **youtube.js**: YouTube video metadata
- **jimaku.js**: Subtitle data from Jimaku

### Data Processing
- **points.js**: Points calculation system
- **streak.js**: Streak tracking logic
- **formatters.js**: Data formatting utilities
- **config.js**: Configuration constants

### Visualization
- **generateHeatmapImage.js**: Heatmap generation
- **getCoverImage.js**: Media cover images

### Miscellaneous
- **emojis.js**: Emoji management
- **getSubtitle.js**: Subtitle fetching

## Data Models

### User Data Structure
```javascript
{
  profile: {
    id: string,
    username: string,
    displayName: string,
    avatar: string,
    lastSeen: Date
  },
  stats: {
    [mediaType]: {
      total: number,
      sessions: number,
      lastActivity: Date,
      bestStreak: number,
      currentStreak: number,
      unit: string,
      label: string
    }
  },
  summary: {
    totalSessions: number,
    lastActivity: Date,
    joinDate: Date,
    activeTypes: string[]
  },
  timestamps: {
    updated: Date,
    lastLog: Date
  }
}
```

### Immersion Log Structure
```javascript
{
  user: {
    id: string,
    username: string,
    displayName: string,
    avatar: string
 },
  activity: {
    type: string,
    typeLabel: string,
    amount: number,
    unit: string,
    title: string,
    comment: string,
    url: string,
    anilistUrl: string,
    vndbUrl: string
  },
  metadata: {
    thumbnail: string,
    duration: number,
    source: string,
    vndbInfo: object
  },
  timestamps: {
    created: Date,
    date: string, // YYYY-MM-DD
    month: string, // YYYY-MM
    year: number
  }
}
```

## API Integrations

### Discord.js
- Version 14
- Handles all Discord interactions
- Slash commands, buttons, embeds

### Firebase Cloud Firestore
- User data storage
- Immersion logs
- Statistics tracking

### External APIs
- **YouTube Data API v3**: Video metadata for listening activities
- **VNDB API**: Visual novel information
- **AniList API**: Anime/manga data
- **Google Generative AI (Gemini)**: Ayumi AI functionality
- **Jimaku API**: Subtitle database

## Known Issues and Fixes

### 1. Missing `timestampLabelMap` in leaderboard.js
**Issue**: ReferenceError: timestampLabelMap is not defined in commands/leaderboard.js

**Location**: Line 67 in commands/leaderboard.js
```javascript
let titlePeriod = timestampLabelMap[timestampFilter]; // For dynamic embed title
```

**Fix**: Add the missing timestampLabelMap definition:
```javascript
// Add this near the top of the file with other constants
const timestampLabelMap = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  all_time: "All-time"
};
```

### 2. Interaction Reply Errors
**Issue**: "interaction.reply is not a function" and "Unknown interaction" errors

**Cause**: Incorrect handling of interaction responses in button handlers

**Fix**: Ensure proper use of deferUpdate() and editReply() for button interactions:
```javascript
// In button handlers, use:
await interaction.deferUpdate(); // For updating the original message
// OR
await interaction.deferReply({ ephemeral: true }); // For sending a new ephemeral message
```

### 3. Deprecated Ephemeral Option Warning
**Issue**: Warning about deprecated "ephemeral" option

**Fix**: Replace:
```javascript
// Old way (deprecated)
await interaction.reply({ content: "message", ephemeral: true });

// New way
await interaction.reply({ content: "message", flags: [InteractionResponseFlags.Ephemeral] });
```

### 4. Buffer.File Experimental Warning
**Issue**: ExperimentalWarning: buffer.File is an experimental feature

**Solution**: This is a Node.js warning that can be ignored in production or suppressed with:
```bash
node --no-warnings index.js
```

## Configuration

### Environment Variables (.env)
```
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_client_id
GEMINI_API_KEY=your_google_gemini_api_key
JIMAKU_API_KEY=your_jimaku_api_key
YOUTUBE_API_KEY=your_youtube_data_api_key
```

### Points System
Different media types have different point values:
- Reading/Visual Novel: 0.0028571428571429 points per character
- Manga/Book: 0.25 points per page
- Anime: 13.0 points per episode
- Listening/Reading Time: 0.67 points per minute

### Media Type Configuration (utils/config.js)
Maps media types to labels and units:
- visual_novel: "Visual Novel", "characters"
- manga: "Manga", "pages"
- anime: "Anime", "episodes"
- book: "Book", "pages"
- reading_time: "Reading Time", "minutes"
- listening: "Listening", "minutes"
- reading: "Reading", "characters"

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment variables
4. Set up Firebase service account key
5. Run the bot: `npm run dev`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Push to branch
5. Open pull request

This documentation provides a comprehensive overview of the Yuyuko Bot project structure, components, and functionality to help developers understand and contribute to the project.
