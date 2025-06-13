import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  Message
} from 'discord.js';
import { AuthService } from '../services/auth';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show all available commands and their descriptions')
  .addStringOption(option =>
    option.setName('command')
      .setDescription('Get detailed help for a specific command')
      .setRequired(false)
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  authService: AuthService
) {
  try {
    await interaction.deferReply();    const specificCommand = interaction.options.getString('command');
    const isUserBound = await authService.isUserBound(interaction.user.id);
    const isAdmin = interaction.member ? authService.isAdmin(interaction.member as any) : false;

    if (specificCommand) {
      // Show detailed help for specific command
      await showCommandDetails(interaction, specificCommand, isUserBound, isAdmin);
    } else {
      // Show general help with all commands
      await showGeneralHelp(interaction, isUserBound, isAdmin);
    }

  } catch (error) {
    Logger.error('Error in help command:', error);
    
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Error')
      .setDescription('An error occurred while loading help information.')
      .setTimestamp();

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
}

export async function executePrefix(
  message: Message,
  args: string[],
  authService: AuthService
) {
  try {    const specificCommand = args[0];
    const isUserBound = await authService.isUserBound(message.author.id);
    const isAdmin = message.member ? authService.isAdmin(message.member as any) : false;

    if (specificCommand) {
      // Show detailed help for specific command
      await showCommandDetailsPrefix(message, specificCommand, isUserBound, isAdmin);
    } else {
      // Show general help with all commands
      await showGeneralHelpPrefix(message, isUserBound, isAdmin);
    }

  } catch (error) {
    Logger.error('Error in help command (prefix):', error);
    
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Error')
      .setDescription('An error occurred while loading help information.')
      .setTimestamp();

    await message.reply({ 
      embeds: [embed],
      allowedMentions: { repliedUser: false }
    });
  }
}

async function getAvailableCommands(): Promise<CommandInfo[]> {
  const commands: CommandInfo[] = [];
  const commandsDir = path.join(__dirname);
  
  try {
    const allFiles = fs.readdirSync(commandsDir);
    
    // Use the same filtering logic as the main bot
    const isProduction = __filename.endsWith('.js');
    const files = allFiles.filter(file => {
      if (isProduction) {
        // Only include .js files, exclude .d.ts and .js.map files
        return file.endsWith('.js') && !file.includes('.d.') && !file.includes('.map');
      } else {
        // Only include .ts files, exclude .d.ts files
        return file.endsWith('.ts') && !file.includes('.d.');
      }
    });
    
    for (const file of files) {
      const commandName = file.replace(/\.(js|ts)$/, '');
      
      // Skip the help command itself to avoid recursion
      if (commandName === 'help') continue;
      
      try {
        // Dynamically import the command module
        const commandModule = await import(path.join(commandsDir, file));
        
        if (commandModule.data) {
          const commandData = commandModule.data;
          commands.push({
            name: commandData.name,
            description: commandData.description,
            options: commandData.options || [],
            category: getCommandCategory(commandName)
          });
        }
      } catch (error) {
        Logger.error(`Failed to load command ${commandName}:`, error);
      }
    }
  } catch (error) {
    Logger.error('Failed to read commands directory:', error);
  }
  
  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

function getCommandCategory(commandName: string): string {
  const categories: { [key: string]: string } = {
    'bind': 'Authentication',
    'unbind': 'Authentication',
    'status': 'Authentication',
    'servers': 'Server Management',
    'create-server': 'Server Management',
    'delete-server': 'Server Management',
    'power': 'Server Management',
    'monitor': 'Server Management',
    'ping': 'Utility',
    'help': 'Utility'
  };
  
  return categories[commandName] || 'General';
}

async function showGeneralHelp(interaction: ChatInputCommandInteraction, isUserBound: boolean, isAdmin: boolean) {
  const commands = await getAvailableCommands();
  const categories = groupCommandsByCategory(commands);
  
  const embed = new EmbedBuilder()
    .setColor('Blue')
    .setTitle('🤖 Bot Help & Commands')
    .setDescription('Here are all available commands organized by category:')
    .setTimestamp();

  // Add account status info
  if (isUserBound) {
    embed.addFields({
      name: '✅ Account Status',
      value: `Your account is bound and ready to use! ${isAdmin ? '**[ADMIN]**' : ''}`,
      inline: false
    });
  } else {
    embed.addFields({
      name: '⚠️ Account Status',
      value: 'Your account is not bound. Use `/bind` to get started!',
      inline: false
    });
  }

  // Add categories
  for (const [category, categoryCommands] of Object.entries(categories)) {
    const commandList = categoryCommands.map(cmd => {
      const access = getCommandAccess(cmd.name, isUserBound, isAdmin);
      return `\`/${cmd.name}\` - ${cmd.description} ${access}`;
    }).join('\n');
    
    embed.addFields({
      name: `${getCategoryEmoji(category)} ${category}`,
      value: commandList,
      inline: false
    });
  }

  embed.addFields(
    {
      name: '💡 Tips',
      value: '• Use `/help <command>` for detailed info about a specific command\n• You can also use prefix commands with `!` (e.g., `!servers`)\n• Some commands require account binding first',
      inline: false
    },
    {
      name: '🔗 Getting Started',
      value: isUserBound 
        ? 'You\'re all set! Try `/servers` to see your servers.' 
        : 'Start by using `/bind` to connect your Pterodactyl account.',
      inline: false
    }
  );

  await interaction.editReply({ embeds: [embed] });
}

async function showGeneralHelpPrefix(message: Message, isUserBound: boolean, isAdmin: boolean) {
  const commands = await getAvailableCommands();
  const categories = groupCommandsByCategory(commands);
  
  const embed = new EmbedBuilder()
    .setColor('Blue')
    .setTitle('🤖 Bot Help & Commands')
    .setDescription('Here are all available commands organized by category:')
    .setTimestamp();

  // Add account status info
  if (isUserBound) {
    embed.addFields({
      name: '✅ Account Status',
      value: `Your account is bound and ready to use! ${isAdmin ? '**[ADMIN]**' : ''}`,
      inline: false
    });
  } else {
    embed.addFields({
      name: '⚠️ Account Status',
      value: 'Your account is not bound. Use `!bind` to get started!',
      inline: false
    });
  }

  // Add categories
  for (const [category, categoryCommands] of Object.entries(categories)) {
    const commandList = categoryCommands.map(cmd => {
      const access = getCommandAccess(cmd.name, isUserBound, isAdmin);
      return `\`!${cmd.name}\` / \`/${cmd.name}\` - ${cmd.description} ${access}`;
    }).join('\n');
    
    embed.addFields({
      name: `${getCategoryEmoji(category)} ${category}`,
      value: commandList,
      inline: false
    });
  }

  embed.addFields(
    {
      name: '💡 Tips',
      value: '• Use `!help <command>` for detailed info about a specific command\n• You can use both prefix (`!`) and slash (`/`) commands\n• Some commands require account binding first',
      inline: false
    },
    {
      name: '🔗 Getting Started',
      value: isUserBound 
        ? 'You\'re all set! Try `!servers` to see your servers.' 
        : 'Start by using `!bind <your_api_key>` to connect your Pterodactyl account.',
      inline: false
    }
  );

  await message.reply({ 
    embeds: [embed],
    allowedMentions: { repliedUser: false }
  });
}

async function showCommandDetails(interaction: ChatInputCommandInteraction, commandName: string, isUserBound: boolean, isAdmin: boolean) {
  const commands = await getAvailableCommands();
  const command = commands.find(cmd => cmd.name === commandName.toLowerCase());
  
  if (!command) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Command Not Found')
      .setDescription(`Command \`${commandName}\` was not found.`)
      .addFields({
        name: '💡 Available Commands',
        value: commands.map(cmd => `\`${cmd.name}\``).join(', '),
        inline: false
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const access = getCommandAccess(command.name, isUserBound, isAdmin);
  const detailedInfo = getCommandDetailedInfo(command.name);

  const embed = new EmbedBuilder()
    .setColor('Blue')
    .setTitle(`📖 Command: /${command.name}`)
    .setDescription(command.description)
    .addFields(
      {
        name: '🏷️ Category',
        value: command.category,
        inline: true
      },
      {
        name: '🔐 Access',
        value: access,
        inline: true
      }
    );

  if (command.options && command.options.length > 0) {
    const optionsList = command.options.map((opt: any) => {
      const required = opt.required ? '(Required)' : '(Optional)';
      return `\`${opt.name}\` ${required} - ${opt.description}`;
    }).join('\n');

    embed.addFields({
      name: '⚙️ Options',
      value: optionsList,
      inline: false
    });
  }

  if (detailedInfo.usage) {
    embed.addFields({
      name: '💡 Usage Examples',
      value: detailedInfo.usage,
      inline: false
    });
  }

  if (detailedInfo.notes) {
    embed.addFields({
      name: '📝 Notes',
      value: detailedInfo.notes,
      inline: false
    });
  }

  embed.setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

async function showCommandDetailsPrefix(message: Message, commandName: string, isUserBound: boolean, isAdmin: boolean) {
  const commands = await getAvailableCommands();
  const command = commands.find(cmd => cmd.name === commandName.toLowerCase());
  
  if (!command) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Command Not Found')
      .setDescription(`Command \`${commandName}\` was not found.`)
      .addFields({
        name: '💡 Available Commands',
        value: commands.map(cmd => `\`${cmd.name}\``).join(', '),
        inline: false
      })
      .setTimestamp();

    await message.reply({ 
      embeds: [embed],
      allowedMentions: { repliedUser: false }
    });
    return;
  }

  const access = getCommandAccess(command.name, isUserBound, isAdmin);
  const detailedInfo = getCommandDetailedInfo(command.name);

  const embed = new EmbedBuilder()
    .setColor('Blue')
    .setTitle(`📖 Command: ${command.name}`)
    .setDescription(command.description)
    .addFields(
      {
        name: '🏷️ Category',
        value: command.category,
        inline: true
      },
      {
        name: '🔐 Access',
        value: access,
        inline: true
      }
    );

  if (command.options && command.options.length > 0) {
    const optionsList = command.options.map((opt: any) => {
      const required = opt.required ? '(Required)' : '(Optional)';
      return `\`${opt.name}\` ${required} - ${opt.description}`;
    }).join('\n');

    embed.addFields({
      name: '⚙️ Options',
      value: optionsList,
      inline: false
    });
  }

  if (detailedInfo.usage) {
    embed.addFields({
      name: '💡 Usage Examples',
      value: detailedInfo.usage,
      inline: false
    });
  }

  if (detailedInfo.notes) {
    embed.addFields({
      name: '📝 Notes',
      value: detailedInfo.notes,
      inline: false
    });
  }

  embed.setTimestamp();
  await message.reply({ 
    embeds: [embed],
    allowedMentions: { repliedUser: false }
  });
}

function groupCommandsByCategory(commands: CommandInfo[]): { [category: string]: CommandInfo[] } {
  const categories: { [category: string]: CommandInfo[] } = {};
  
  for (const command of commands) {
    if (!categories[command.category]) {
      categories[command.category] = [];
    }
    categories[command.category].push(command);
  }
  
  return categories;
}

function getCategoryEmoji(category: string): string {
  const emojis: { [key: string]: string } = {
    'Authentication': '🔐',
    'Server Management': '🎮',
    'Utility': '🛠️',
    'General': '📋'
  };
  
  return emojis[category] || '📋';
}

function getCommandAccess(commandName: string, isUserBound: boolean, isAdmin: boolean): string {
  const adminCommands: string[] = []; // No admin-only commands - server ownership determines access
  const authRequiredCommands = ['servers', 'create-server', 'delete-server', 'power', 'monitor', 'unbind', 'status'];
  
  if (adminCommands.includes(commandName)) {
    return isAdmin ? '✅ Available (Admin)' : '❌ Admin Only';
  } else if (authRequiredCommands.includes(commandName)) {
    return isUserBound ? '✅ Available' : '❌ Requires Binding';
  } else {
    return '✅ Available';
  }
}

function getCommandDetailedInfo(commandName: string): { usage?: string; notes?: string } {
  const details: { [key: string]: { usage?: string; notes?: string } } = {
    'bind': {
      usage: '`/bind method:"API Key Only" api_key:your_key`\n`!bind your_api_key_here`',
      notes: 'Connects your Discord account to your Pterodactyl account. Only one Discord account can be bound per Pterodactyl account.'
    },
    'servers': {
      usage: '`/servers` or `!servers`',
      notes: 'Shows all your servers with pagination. Click buttons to navigate between pages.'
    },
    'create-server': {
      usage: '`/create-server` or `!create-server`',
      notes: 'Interactive server creation with node and egg selection. Automatically sets up smart startup commands.'
    },    'delete-server': {
      usage: '`/delete-server server_id:server_name` or `!delete-server server_name`',
      notes: 'Delete servers you own. Requires confirmation before deletion. Server data will be permanently lost.'
    },
    'power': {
      usage: '`/power action:start server_id:server_name` or `!power start server_name`',
      notes: 'Available actions: start, stop, restart, kill. You can only control servers you own.'
    },
    'monitor': {
      usage: '`/monitor server_id:server_name` or `!monitor server_name`',
      notes: 'Shows current resource usage (not real-time). Displays memory, CPU, disk, network I/O, and uptime.'
    },
    'status': {
      usage: '`/status` or `!status`',
      notes: 'Shows your current binding status and available commands based on your permissions.'
    },
    'unbind': {
      usage: '`/unbind` or `!unbind`',
      notes: 'Requires confirmation. You will lose access to server management commands until you bind again.'
    },
    'ping': {
      usage: '`/ping` or `!ping`',
      notes: 'Shows bot latency, uptime, and system information.'
    }
  };
  
  return details[commandName] || {};
}

interface CommandInfo {
  name: string;
  description: string;
  options: any[];
  category: string;
}
