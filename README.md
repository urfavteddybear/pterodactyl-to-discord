# Pterodactyl Discord Bot

A powerful Discord bot that integrates with Pterodactyl Panel to provide comprehensive server management capabilities directly from Discord. Built with Discord.js v14 and TypeScript.

## Features

- 🔐 **Secure Authentication**: Bind Discord accounts to Pterodactyl users with API key validation and duplicate prevention
- 🎮 **Complete Server Management**: Create, delete, start, stop, restart, kill, and monitor servers
- 🖥️ **Resource Monitoring**: Real-time server resource usage with smart formatting (CPU, RAM, Disk, Network)
- 📊 **Interactive Server Lists**: Paginated server listings with live status updates
- 🎛️ **Power Management**: Full server power control with ownership validation
- 🗄️ **SQLite Database**: Persistent user data and server tracking with foreign key constraints
- 🛡️ **Ownership-Based Security**: Server operations based on actual ownership, not Discord roles
- 🎨 **Modern UI**: Button-based confirmations and interactive menus
- 📝 **Auto-Updating Help**: Dynamic command discovery and categorized help system
- ⚡ **Smart Resource Display**: Intelligent formatting for memory/disk (MiB/GiB) and unlimited resources

## Commands

### Authentication Commands
- `/bind` - Bind your Discord account to Pterodactyl (API key auto-detection, prevents duplicates)
- `/unbind` - Unbind your Discord account with button confirmation
- `/status` - Check your account binding status and available commands

### Server Management Commands
- `/servers` - List all your servers with pagination and real-time status
- `/create-server` - Interactive server creation with node and egg selection
- `/delete-server [server_id]` - Delete your own servers (ownership-based, no admin role required)
- `/power <action> <server_id>` - Manage server power (start/stop/restart/kill)
- `/monitor <server_id>` - View detailed server resource usage and statistics

### Utility Commands
- `/ping` - Check bot latency, uptime, and system information
- `/help [command]` - Show all commands or detailed help for specific command

### Prefix Commands
All commands also work with the `!` prefix (configurable):
- `!bind <api_key>` - Simple API key binding with auto-detection
- `!servers` - View your servers with pagination
- `!create-server` - Interactive server creation
- `!delete-server <identifier>` - Delete server with button confirmation
- `!power <action> <identifier>` - Server power management
- `!monitor <identifier>` - Server resource monitoring
- `!status` - Check binding status
- `!ping` - Bot status check
- `!help [command]` - Command help

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
   ```   **Note**: `ADMIN_ROLE_ID` is no longer required as the bot now uses server ownership validation instead of Discord roles.

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Start the bot**
   ```bash
   npm start
   ```

## Key Features & Improvements

### 🔒 Server Ownership-Based Security
Unlike other bots that rely on Discord roles, this bot validates actual Pterodactyl server ownership. Users can only manage servers they truly own in the panel.

### 🎛️ Interactive Server Management
- **Power Control**: Start, stop, restart, or kill servers with interactive button menus
- **Resource Monitoring**: View CPU, RAM, disk usage, network I/O, and uptime
- **Smart Formatting**: Memory and disk display in appropriate units (MiB/GiB)
- **Unlimited Resources**: Shows "Unlimited" for servers with no resource caps

### 🔐 Enhanced Authentication
- **Auto-Detection**: API key automatically identifies the user - no manual user ID needed
- **Duplicate Prevention**: Prevents multiple Discord accounts from binding to the same Pterodactyl account
- **Button Confirmations**: All destructive operations require interactive confirmation

### 📊 Advanced Server Listings
- **Live Status**: Real-time server status updates
- **Pagination**: Handle large server lists with navigation buttons
- **Detailed Info**: Server specs, resource usage, and current state

### 🤖 Modern Help System
- **Auto-Discovery**: Automatically detects and categorizes all available commands
- **Clean Interface**: Minimalist design focused on essential information
- **Dynamic Updates**: Help system updates automatically when new commands are added

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
- `pterodactyl_user_id` - Pterodactyl user ID (unique - prevents duplicate bindings)
- `pterodactyl_api_key` - User's Pterodactyl API key
- `bound_at` - Timestamp of binding

### user_servers
- `id` - Primary key
- `discord_id` - Discord user ID (foreign key)
- `server_uuid` - Pterodactyl server UUID
- `server_name` - Server name
- `created_at` - Creation timestamp

**Foreign Key Constraints**: Ensures data integrity and automatic cleanup when users are unbound.

## Security Features

- **Server Ownership Validation**: All server operations validate actual Pterodactyl ownership, not Discord roles
- **API Key Auto-Detection**: Automatically detects user from API key, no manual user ID input needed
- **Duplicate Prevention**: One Pterodactyl account can only be bound to one Discord account
- **Input Sanitization**: All user inputs are validated and sanitized
- **Button Confirmations**: Destructive operations require interactive button confirmations
- **Ephemeral Responses**: Sensitive information uses ephemeral Discord messages
- **Error Handling**: Comprehensive error handling prevents information leakage
- **Resource Access Control**: Users can only manage servers they actually own

## Error Handling

The bot includes comprehensive error handling for:
- Invalid API keys with specific error messages
- Network connectivity issues and timeouts
- Pterodactyl API errors with user-friendly messages
- Database connection problems and constraint violations
- Discord API rate limits and interaction timeouts
- Server ownership validation failures
- Resource monitoring API errors
- Power state change failures

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support, please:
1. Check the logs for error messages
2. Verify your configuration in `.env`
3. Ensure Pterodactyl Panel is accessible
4. Check Discord bot permissions

## Troubleshooting

### Common Issues & Solutions

#### "You don't have permission to delete this server"
- **Cause**: You're trying to delete a server you don't own in Pterodactyl
- **Solution**: Only server owners can delete their servers. Discord admin roles don't override this.

#### "Server not found" for server commands
- **Cause**: Server identifier doesn't match or you don't have access
- **Solution**: Use `/servers` to see your available servers and copy the exact name or UUID

#### Binding Issues
If you're getting "invalid API key" errors when trying to bind:

1. **Verify API Key Type**: Make sure you're using a **CLIENT API key**, not an Application API key
   - Go to your Pterodactyl panel → Account Settings → API Credentials
   - Create a new CLIENT API key (starts with `ptlc_`)

2. **Check Panel URL**: Ensure your `PTERODACTYL_URL` in `.env` is correct:
   - Should NOT end with `/api/` 
   - Example: `https://panel.example.com` (not `https://panel.example.com/api/`)

3. **Test Panel Access**: Try accessing your panel directly to ensure it's reachable

#### Power Command Issues
- **"Server is already in that state"**: The server is already in the requested power state
- **"Power action failed"**: Check if the server supports the requested action (some eggs don't support all power states)

#### Resource Monitoring Issues
- **"Unable to fetch resource usage"**: Server might be offline or panel API temporarily unavailable
- **"Resource data unavailable"**: Some servers don't report resource usage when offline

### Error Message Meanings

- **"Connection refused"**: Panel URL is incorrect or panel is down
- **"Domain not found"**: Panel URL domain doesn't exist  
- **"Access forbidden"**: API key permissions issue
- **"Endpoint not found"**: Panel URL path is incorrect
- **"Account already bound"**: One Pterodactyl account per Discord user limit

### Debug Mode

Enable debug logging by setting `NODE_ENV=development` in your `.env` file.

## Performance & Reliability

- **Efficient Database**: SQLite with proper indexing and foreign key constraints
- **Error Recovery**: Graceful handling of network issues and API timeouts  
- **Memory Management**: Proper cleanup and resource management
- **Rate Limiting**: Respects Discord and Pterodactyl API rate limits
- **Connection Pooling**: Optimized database connections
- **Background Processing**: Non-blocking operations for better responsiveness

## Changelog

### v2.0.0 (Current)
- ✅ **Fixed server ownership validation** - Removed Discord role requirements, now uses actual Pterodactyl ownership
- ✅ **Added complete power management** - Start, stop, restart, kill servers with interactive menus
- ✅ **Implemented resource monitoring** - Real-time server resource usage with smart formatting
- ✅ **Enhanced server listings** - Pagination with live status updates and smart resource display
- ✅ **Added duplicate prevention** - One Pterodactyl account per Discord user
- ✅ **Improved button confirmations** - Interactive button-based confirmations for destructive operations
- ✅ **Auto-updating help system** - Dynamic command discovery with categorized help
- ✅ **Smart resource formatting** - MiB/GiB display and "Unlimited" for uncapped resources
- ✅ **Fixed command loading errors** - Resolved .d.ts file loading issues in production
- ✅ **Clean minimalist help** - Removed clutter from help command for better UX

### v1.0.0
- Initial release
- Basic server management commands
- User authentication system
- Admin role support
- SQLite database integration
