# Pterodactyl Discord Bot

A powerful Discord bot that integrates with Pterodactyl Panel to provide server management capabilities directly from Discord. Built with Discord.js v14 and TypeScript.

## Features

- 🔐 **Secure Authentication**: Bind Discord accounts to Pterodactyl users with API key validation
- 🎮 **Server Management**: Create, delete, start, stop, and restart servers
- 👥 **Role-Based Access**: Admin-only commands for destructive operations
- 📊 **Server Overview**: View detailed server information and status
- 🗄️ **SQLite Database**: Persistent user data and server tracking
- 🛡️ **Security First**: Comprehensive input validation and error handling

## Commands

### User Commands
- `/bind` - Bind your Discord account to Pterodactyl (API key only - no user ID needed!)
- `/unbind` - Unbind your Discord account
- `/status` - Check your account binding status
- `/servers` - View and manage your servers
- `/create-server` - Create a new server with interactive setup
- `/ping` - Check bot status

### Admin Commands
- `/delete-server [server_id]` - Delete servers (requires admin role)

### Prefix Commands
All commands also work with the `!` prefix:
- `!bind <api_key>` - Simple API key binding
- `!servers` - View your servers
- `!create-server <name> <memory> <disk> <cpu> [description]` - Create server
- `!status` - Check binding status
- `!ping` - Bot status check

## Setup

### Prerequisites
- Node.js 18+ 
- A Pterodactyl Panel instance with API access
- Discord Bot Token and Application ID

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd pterodactyl-panel-on-discord
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Discord Bot Configuration
   DISCORD_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_discord_application_id_here
   
   # Pterodactyl Panel Configuration
   PTERODACTYL_URL=https://your-panel.example.com
   PTERODACTYL_API_KEY=your_pterodactyl_admin_api_key_here
   
   # Database Configuration
   DATABASE_PATH=./database.sqlite
   
   # Bot Configuration
   PREFIX=!
   ADMIN_ROLE_ID=your_admin_role_id_here
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Start the bot**
   ```bash
   npm start
   ```

### Development

For development with auto-reload:
```bash
npm run dev:watch
```

For single development run:
```bash
npm run dev
```

## Discord Bot Setup

1. **Create a Discord Application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to "Bot" section and create a bot
   - Copy the bot token for `DISCORD_TOKEN`
   - Copy the application ID for `CLIENT_ID`

2. **Set Bot Permissions**
   - Enable "Send Messages", "Use Slash Commands", "Embed Links"
   - Generate invite link with necessary permissions

3. **Invite Bot to Server**
   - Use the generated invite link
   - Ensure the bot has appropriate role permissions

## Pterodactyl Panel Setup

1. **Generate Admin API Key**
   - Go to your Pterodactyl panel admin area
   - Navigate to API → Application API
   - Create a new API key with full permissions
   - Use this key for `PTERODACTYL_API_KEY`

2. **User API Keys**
   - Users need to generate their own client API keys
   - Go to Account → API Credentials → Create API Key
   - Users will use these keys with the `/bind` command

## Database Schema

The bot uses SQLite with the following tables:

### bound_users
- `id` - Primary key
- `discord_id` - Discord user ID (unique)
- `pterodactyl_user_id` - Pterodactyl user ID
- `pterodactyl_api_key` - User's Pterodactyl API key
- `bound_at` - Timestamp of binding

### user_servers
- `id` - Primary key
- `discord_id` - Discord user ID
- `server_uuid` - Pterodactyl server UUID
- `server_name` - Server name
- `created_at` - Creation timestamp

## Security Features

- **API Key Validation**: All API keys are validated before storage
- **Role-Based Access**: Admin commands require specific Discord roles
- **Input Sanitization**: All user inputs are validated and sanitized
- **Error Handling**: Comprehensive error handling prevents information leakage
- **Ephemeral Responses**: Sensitive information uses ephemeral Discord messages

## Error Handling

The bot includes comprehensive error handling for:
- Invalid API keys
- Network connectivity issues  
- Pterodactyl API errors
- Database connection problems
- Discord API rate limits

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For support, please:
1. Check the logs for error messages
2. Verify your configuration in `.env`
3. Ensure Pterodactyl Panel is accessible
4. Check Discord bot permissions

## Troubleshooting

### "Invalid API key" Error

If you're getting "invalid API key" errors when trying to bind:

1. **Verify API Key Type**: Make sure you're using a **CLIENT API key**, not an Application API key
   - Go to your Pterodactyl panel → Account Settings → API Credentials
   - Create a new CLIENT API key (starts with `ptlc_`)

2. **Test API Connection**: Run the test scripts to debug the issue:
   ```bash
   # Test general API connectivity
   npx ts-node test-api.ts
   
   # Test bind operation specifically
   npx ts-node test-bind.ts
   ```

3. **Check Panel URL**: Ensure your `PTERODACTYL_URL` in `.env` is correct:
   - Should NOT end with `/api/` 
   - Example: `https://panel.example.com` (not `https://panel.example.com/api/`)

4. **Verify Panel Access**: Try accessing these URLs in your browser while logged in:
   - Admin API: `https://your-panel.com/api/application/users`
   - Client API: `https://your-panel.com/api/client/account`

### Common Issues

- **"Connection refused"**: Panel URL is incorrect or panel is down
- **"Domain not found"**: Panel URL domain doesn't exist
- **"Access forbidden"**: API key permissions issue
- **"Endpoint not found"**: Panel URL path is incorrect

### Debug Mode

Enable debug logging by setting `NODE_ENV=development` in your `.env` file.

## Changelog

### v1.0.0
- Initial release
- Basic server management commands
- User authentication system
- Admin role support
- SQLite database integration
