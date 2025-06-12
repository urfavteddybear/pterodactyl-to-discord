# Pterodactyl Discord Bot

A Discord bot for managing Pterodactyl Panel servers.

## Setup

1. Copy `.env.example` to `.env` and fill in your configuration
2. Install dependencies: `npm install`
3. Build the project: `npm run build`
4. Start the bot: `npm start`

## Development

For development with auto-reload:
```bash
npm run dev:watch
```

## Configuration

Create a `.env` file with:
- `DISCORD_TOKEN` - Your Discord bot token
- `CLIENT_ID` - Your Discord application ID
- `PTERODACTYL_URL` - Your Pterodactyl panel URL
- `PTERODACTYL_API_KEY` - Your Pterodactyl admin API key
- `ADMIN_ROLE_ID` - Discord role ID for admin commands

## Commands

- `/bind <user_id> <api_key>` - Bind Discord account to Pterodactyl
- `/servers` - View your servers
- `/create-server` - Create a new server
- `/delete-server` - Delete a server (admin only)
- `/status` - Check binding status

The bot is now ready to be configured and deployed!

## Next Steps

1. Set up your environment variables in `.env`
2. Run the development server with `npm run dev:watch`
3. Invite the bot to your Discord server
4. Test the commands

Your Pterodactyl Discord bot is ready to use!
