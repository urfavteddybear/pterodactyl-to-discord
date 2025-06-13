import { 
  Client, 
  GatewayIntentBits, 
  Collection, 
  Events, 
  REST, 
  Routes,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ComponentType,
  ActivityType
} from 'discord.js';
import { config } from 'dotenv';
import { DatabaseConnection } from './database/connection';
import { AuthService } from './services/auth';
import { PterodactylService } from './services/pterodactyl';
import { Logger } from './utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
config();

// Interfaces
interface Command {
  data: any;
  execute: (interaction: ChatInputCommandInteraction, ...args: any[]) => Promise<void>;
  executePrefix?: (message: any, args: string[], authService: any, pterodactylService: any) => Promise<void>;
}

class PterodactylBot {  private client: Client;
  private commands: Collection<string, Command>;
  private database: DatabaseConnection;
  private authService: AuthService;
  private pterodactylService: PterodactylService;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.commands = new Collection();
    this.database = new DatabaseConnection();
    this.authService = new AuthService(this.database);
    this.pterodactylService = new PterodactylService();

    this.setupEventHandlers();
  }  private async loadCommands(): Promise<void> {
    const commandsPath = path.join(__dirname, 'commands');
    
    // In production (compiled), only look for .js files
    // In development (ts-node), look for .ts files
    const isProduction = __filename.endsWith('.js');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => 
      isProduction ? file.endsWith('.js') : file.endsWith('.ts')
    );

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = await import(filePath);
      
      if ('data' in command && 'execute' in command) {
        this.commands.set(command.data.name, command);
        Logger.info(`Loaded command: ${command.data.name}`);
      } else {
        Logger.warn(`Command at ${filePath} is missing required "data" or "execute" property.`);
      }
    }
  }

  private async deployCommands(): Promise<void> {
    const commands = [];
    for (const [, command] of this.commands) {
      commands.push(command.data.toJSON());
    }

    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

    try {
      Logger.info(`Started refreshing ${commands.length} application (/) commands.`);

      const data = await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID!),
        { body: commands },
      );

      Logger.info(`Successfully reloaded ${(data as any).length} application (/) commands.`);
    } catch (error) {
      Logger.error('Error deploying commands:', error);
    }
  }  private setupEventHandlers(): void {
    this.client.once(Events.ClientReady, async (readyClient) => {
      Logger.info(`Bot is ready! Logged in as ${readyClient.user.tag}`);
      Logger.info(`Connected to ${readyClient.guilds.cache.size} guilds`);
      
      // Set bot presence after a small delay to ensure client is fully ready
      setTimeout(async () => {
        await this.updateBotPresence();
      }, 1000);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isChatInputCommand()) {
        await this.handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction);
      }
    });

    this.client.on(Events.MessageCreate, async (message) => {
      await this.handlePrefixCommand(message);
    });

    this.client.on(Events.Error, (error) => {
      Logger.error('Discord client error:', error);
    });

    this.client.on(Events.Warn, (warning) => {
      Logger.warn('Discord client warning:', warning);
    });
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command) {
      Logger.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction, this.authService, this.pterodactylService);
    } catch (error) {
      Logger.error(`Error executing command ${interaction.commandName}:`, error);
      
      const errorMessage = {
        content: 'There was an error while executing this command!',
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
  private async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    try {
      const [action, subAction, serverUuid] = interaction.customId.split('_');      // Skip prefix and slash command buttons - they're handled by their respective commands
      if (action === 'prefix' || action === 'slash') {
        return;
      }

      if (action === 'confirm' && subAction === 'delete') {
        await interaction.deferUpdate();

        // Check if user is authenticated and admin
        const context = await this.authService.requireAdmin(interaction.user, interaction.member as any);
        
        // Delete the server
        await this.pterodactylService.deleteServer(serverUuid);        // Remove from database
        this.database.removeUserServer(interaction.user.id, serverUuid);

        const embed = {
          color: 0x00ff00,
          title: '✅ Server Deleted Successfully',
          description: `Server with UUID **${serverUuid}** has been permanently deleted.`,
          timestamp: new Date().toISOString(),
        };

        await interaction.editReply({ embeds: [embed], components: [] });
        Logger.info(`User ${interaction.user.tag} confirmed deletion of server: ${serverUuid}`);

      } else if (action === 'cancel' && subAction === 'delete') {
        await interaction.deferUpdate();

        const embed = {
          color: 0xffa500,
          title: '❌ Deletion Cancelled',
          description: 'Server deletion has been cancelled.',
          timestamp: new Date().toISOString(),
        };

        await interaction.editReply({ embeds: [embed], components: [] });
      }

    } catch (error) {
      Logger.error('Error handling button interaction:', error);
        const errorEmbed = {
        color: 0xff0000,
        title: '❌ Error',
        description: error instanceof Error ? error.message : 'An error occurred while processing the action.',
        timestamp: new Date().toISOString(),
      };

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed], components: [] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }

  private async handlePrefixCommand(message: any): Promise<void> {
    // Ignore messages from bots
    if (message.author.bot) return;

    const prefix = process.env.PREFIX || '!';

    // Check if message starts with prefix
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    // Find command
    const command = this.commands.get(commandName);
    if (!command) return;

    // Check if command has prefix support
    if (!command.executePrefix) {
      const availableCommands = Array.from(this.commands.keys())
        .filter(name => this.commands.get(name)?.executePrefix)
        .map(name => `\`${prefix}${name}\``)
        .join(', ');

      await message.reply({
        content: `❌ This command is only available as a slash command. Use \`/${commandName}\` instead.\n\n**Available prefix commands:** ${availableCommands || 'None'}`,
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    try {
      await command.executePrefix(message, args, this.authService, this.pterodactylService);
    } catch (error) {
      Logger.error(`Error executing prefix command ${commandName}:`, error);
      await message.reply({
        content: '❌ There was an error while executing this command!',
        allowedMentions: { repliedUser: false }
      });
    }
  }
  private async updateBotPresence(): Promise<void> {
    if (!this.client.user) return;

    try {
      const guildCount = this.client.guilds.cache.size;
      
      await this.client.user.setPresence({
        activities: [{
          name: `Pterodactyl Panel | ${guildCount} server${guildCount !== 1 ? 's' : ''}`,
          type: ActivityType.Playing,
        }],
        status: 'online',
      });

      Logger.info(`Bot presence set to "Playing Pterodactyl Panel | ${guildCount} server${guildCount !== 1 ? 's' : ''}"`);
    } catch (error) {
      Logger.error('Failed to update bot presence:', error);
    }
  }

  public async start(): Promise<void> {
    try {
      // Validate environment variables
      if (!process.env.DISCORD_TOKEN) {
        throw new Error('DISCORD_TOKEN is required');
      }
      if (!process.env.CLIENT_ID) {
        throw new Error('CLIENT_ID is required');
      }
      if (!process.env.PTERODACTYL_URL) {
        throw new Error('PTERODACTYL_URL is required');
      }
      if (!process.env.PTERODACTYL_API_KEY) {
        throw new Error('PTERODACTYL_API_KEY is required');
      }

      // Load and deploy commands
      await this.loadCommands();
      await this.deployCommands();

      // Login to Discord
      await this.client.login(process.env.DISCORD_TOKEN);

    } catch (error) {
      Logger.error('Error starting bot:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    Logger.info('Shutting down bot...');
    this.database.close();
    this.client.destroy();
  }
}

// Create and start the bot
const bot = new PterodactylBot();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  Logger.info('Received SIGINT, shutting down gracefully...');
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  Logger.info('Received SIGTERM, shutting down gracefully...');
  await bot.stop();
  process.exit(0);
});

// Start the bot
bot.start().catch((error) => {
  Logger.error('Failed to start bot:', error);
  process.exit(1);
});
