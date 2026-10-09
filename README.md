# CatchUp Summary

Build CatchUp AI — "What Did I Miss?", a polished, responsive web application for catching up on unread conversations.

Users should be able to paste a conversation and get an organized summary of important updates, urgent tasks, deadlines, decisions, and mentions.

IMPORTANT: This project must use a REAL persistent database, not mock database operations or hardcoded records presented as saved data.

Requirements:

Create a clean, professional dashboard with a sidebar and summary cards.

Include a conversation input area and a "Catch me up" button.

Show results in separate sections: Important Updates, Urgent Tasks, Deadlines, Decisions, and Mentions.

Provide sample conversations for easy demonstration, clearly identified as sample data.

Plan a Supabase integration with real tables for conversations, summaries, and extracted action items.

Persist submitted conversations and analysis results in Supabase, and load saved records from the database after refreshing the page.

Use real AI analysis only when a supported AI integration is configured. If it is not configured, show a clearly labeled demo fallback rather than pretending a real AI model was used.

Do not invent tasks, deadlines, decisions, or mentions absent from the source conversation.

Add clear loading, success, empty, and error states.

Include a privacy notice. Do not claim data is stored locally if it is sent to a server.

Protect credentials and never expose service-role keys or other secrets in frontend code.

Keep the implementation beginner-friendly and prioritize the smallest functional MVP.

First, create the application structure and explain what Supabase setup and credentials are needed. Do not pretend the database is connected until the connection has been tested.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/20101bc0-311d-4f33-9e8b-2e018913d6b5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
