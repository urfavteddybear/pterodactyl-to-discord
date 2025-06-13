import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ComponentType,
  Message
} from 'discord.js';
import { AuthService } from '../services/auth';
import { PterodactylService } from '../services/pterodactyl';
import { Logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('monitor')
  .setDescription('View current resource usage of your servers')
  .addStringOption(option =>
    option.setName('server_id')
      .setDescription('Server UUID or name (optional - will show selection if not provided)')
      .setRequired(false)
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  authService: AuthService,
  pterodactylService: PterodactylService
) {
  try {
    await interaction.deferReply();

    // Check if user is authenticated
    const context = await authService.requireAuth(interaction.user, interaction.member as any);
    
    const serverId = interaction.options.getString('server_id');

    if (serverId) {
      // Direct resource monitoring
      await showServerResources(interaction, serverId, context, pterodactylService);
    } else {
      // Show server selection
      await showServerSelection(interaction, context, pterodactylService);
    }

  } catch (error) {
    Logger.error('Error in monitor command:', error);
    
    let errorMessage = 'An error occurred while monitoring server resources.';
    let title = '❌ Error';
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('bind your account first')) {
        title = '🔗 Account Not Bound';
        errorMessage = 'You need to bind your Discord account to your Pterodactyl account first!\n\nUse `/bind` to get started.';
      } else if (error.message.includes('Invalid API key')) {
        title = '🔑 Invalid API Key';
        errorMessage = 'Your API key appears to be invalid or expired. Please use `/bind` with a new API key.';
      } else if (error.message.includes('Connection refused') || error.message.includes('ECONNREFUSED')) {
        title = '🔌 Connection Error';
        errorMessage = 'Unable to connect to the Pterodactyl panel. Please try again later.';
      } else {
        errorMessage = error.message;
      }
    }
    
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle(title)
      .setDescription(errorMessage)
      .setTimestamp();

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
}

async function showServerResources(
  interaction: ChatInputCommandInteraction,
  serverId: string,
  context: any,
  pterodactylService: PterodactylService
) {
  // Set user API key
  pterodactylService.setUserApiKey(context.user.pterodactyl_api_key);
  
  // Get user's servers and verify ownership
  const userServers = await pterodactylService.getUserServers();
  const server = userServers.find(s => 
    s.uuid === serverId || 
    s.id?.toString() === serverId ||
    s.uuid.startsWith(serverId) || // Partial UUID match
    s.name.toLowerCase() === serverId.toLowerCase() // Name match
  );

  if (!server) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Server Not Found')
      .setDescription(`Server with identifier \`${serverId}\` was not found or doesn't belong to you.`)
      .addFields(
        { 
          name: '💡 Tip', 
          value: 'Use `/monitor` without parameters to see your available servers.',
          inline: false 
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Show loading message
  const loadingEmbed = new EmbedBuilder()
    .setColor('Yellow')
    .setTitle('📊 Loading Resource Data...')
    .setDescription(`Fetching resource usage for server **${server.name}**...`)
    .setTimestamp();
  await interaction.editReply({ embeds: [loadingEmbed] });

  try {    // Get server details and resource usage
    const [serverDetails, resourceUsage] = await Promise.all([
      pterodactylService.getServerDetails(server.uuid),
      pterodactylService.getServerResourceUsage(server.uuid)
    ]);
    
    // Extract resources from nested structure
    const resources = resourceUsage.resources || {};
    // Get status from resource usage (more accurate than server details)
    const serverStatus = resourceUsage.current_state || serverDetails.status || 'unknown';

    // Format resource data
    const resourceEmbed = new EmbedBuilder()
      .setColor(getResourceColor(resources))
      .setTitle('📊 Server Resource Monitor')
      .setDescription(`Current resource usage for **${server.name}** (captured at execution time)`)
      .addFields(
        { 
          name: '🏷️ Server Information', 
          value: `**Name:** ${server.name}\n**Status:** ${getStatusEmoji(serverStatus)} ${serverStatus}\n**UUID:** \`${server.uuid.substring(0, 8)}...\``,
          inline: false 
        },
        { 
          name: '💾 Memory Usage', 
          value: formatMemoryUsage(resources.memory_bytes, server.limits?.memory),
          inline: true 
        },
        { 
          name: '⚡ CPU Usage', 
          value: formatCpuUsage(resources.cpu_absolute, server.limits?.cpu),
          inline: true 
        },
        { 
          name: '💽 Disk Usage', 
          value: formatDiskUsage(resources.disk_bytes, server.limits?.disk),
          inline: true 
        },
        { 
          name: '🌐 Network I/O', 
          value: `**↗️ TX:** ${formatBytes(resources.network_tx_bytes)}\n**↙️ RX:** ${formatBytes(resources.network_rx_bytes)}`,
          inline: true 
        },
        { 
          name: '💿 Disk I/O', 
          value: `**📤 Write:** ${formatBytes(resources.disk_io_write_bytes || 0)}\n**📥 Read:** ${formatBytes(resources.disk_io_read_bytes || 0)}`,
          inline: true 
        },
        { 
          name: '🔄 Uptime', 
          value: formatUptime(resources.uptime),
          inline: true 
        }
      )
      .setTimestamp()
      .setFooter({ text: 'Data refreshed' });

    await interaction.editReply({ embeds: [resourceEmbed] });

    Logger.info(`User ${interaction.user.tag} monitored resources for server: ${server.name} (${server.uuid})`);

  } catch (error) {
    Logger.error('Error fetching server resources:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Resource Monitoring Failed')
      .setDescription(`Failed to fetch resource data for server **${server.name}**.`)
      .addFields(
        { 
          name: '🔍 Error Details', 
          value: error instanceof Error ? error.message : 'Unknown error occurred',
          inline: false 
        },
        {
          name: '💡 Possible Causes',
          value: '• Server is offline\n• Resource monitoring unavailable\n• API connection issues',
          inline: false
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

async function showServerSelection(
  interaction: ChatInputCommandInteraction,
  context: any,
  pterodactylService: PterodactylService
) {
  // Set user API key
  pterodactylService.setUserApiKey(context.user.pterodactyl_api_key);

  // Get user servers
  const servers = await pterodactylService.getUserServers();

  if (servers.length === 0) {
    const embed = new EmbedBuilder()
      .setColor('Blue')
      .setTitle('📋 No Servers Found')
      .setDescription('You don\'t have any servers to monitor.')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Create select menu for servers
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('select_server_monitor')
    .setPlaceholder('Choose a server to monitor')
    .addOptions(
      servers.slice(0, 25).map(server => ({
        label: server.name,
        description: `Status: ${server.status} | UUID: ${server.uuid.substring(0, 8)}...`,
        value: server.uuid,
      }))
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const embed = new EmbedBuilder()
    .setColor('Blue')
    .setTitle('📊 Server Resource Monitor')
    .setDescription('Select a server to view its resource usage:')
    .addFields(
      servers.slice(0, 10).map(server => ({
        name: server.name,
        value: `**Status:** ${getStatusEmoji(server.status)} ${server.status}\n**UUID:** \`${server.uuid}\``,
        inline: true
      }))
    )
    .setTimestamp();

  const response = await interaction.editReply({
    embeds: [embed],
    components: [row]
  });

  // Wait for selection
  try {
    const selectInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      filter: i => i.user.id === interaction.user.id,
      time: 60000
    });

    const selectedServerUuid = selectInteraction.values[0];
    
    await selectInteraction.deferUpdate();
    await showServerResources(interaction, selectedServerUuid, context, pterodactylService);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('time')) {
      const timeoutEmbed = new EmbedBuilder()
        .setColor('Orange')
        .setTitle('⏰ Selection Timeout')
        .setDescription('Server monitoring selection cancelled due to timeout.')
        .setTimestamp();

      await interaction.editReply({
        embeds: [timeoutEmbed],
        components: []
      });
    } else {
      throw error;
    }
  }
}

export async function executePrefix(
  message: Message,
  args: string[],
  authService: AuthService,
  pterodactylService: PterodactylService
) {
  try {
    // Check if user is authenticated
    const context = await authService.requireAuth(message.author, message.member as any);
    
    if (args.length === 0) {      // Show usage information
      const embed = new EmbedBuilder()
        .setColor('Blue')
        .setTitle('📊 Server Resource Monitor')
        .setDescription('Monitor current resource usage of your servers (captured when command is executed).')
        .addFields(
          { 
            name: 'Usage', 
            value: '`!monitor <server_id>`\nor\n`!monitor` (to select server)',
            inline: false 
          },
          { 
            name: 'Monitored Resources', 
            value: '• 💾 Memory (RAM) usage\n• ⚡ CPU usage\n• 💽 Disk usage\n• 🌐 Network I/O\n• 💿 Disk I/O\n• 🔄 Server uptime',
            inline: false 
          },
          { 
            name: 'Examples', 
            value: '`!monitor MyServer`\n`!monitor 7500bf8a`\n`!monitor` (shows server list)',
            inline: false 
          },
          {
            name: '💡 Note',
            value: 'This shows current usage at the time of execution, not live updating data.',
            inline: false
          }
        )
        .setTimestamp();

      await message.reply({ 
        embeds: [embed],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    // Server ID provided
    const serverId = args.join(' '); // Join in case server name has spaces
    await executePrefixMonitoring(message, serverId, context, pterodactylService);

  } catch (error) {
    Logger.error('Error in monitor command (prefix):', error);
    
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while monitoring server resources.';
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Error')
      .setDescription(errorMessage)
      .setTimestamp();

    await message.reply({ 
      embeds: [embed],
      allowedMentions: { repliedUser: false }
    });
  }
}

async function executePrefixMonitoring(
  message: Message,
  serverId: string,
  context: any,
  pterodactylService: PterodactylService
) {
  // Set user API key
  pterodactylService.setUserApiKey(context.user.pterodactyl_api_key);
  
  // Get user's servers and verify ownership
  const userServers = await pterodactylService.getUserServers();
  const server = userServers.find(s => 
    s.uuid === serverId || 
    s.id?.toString() === serverId ||
    s.uuid.startsWith(serverId) || 
    s.name.toLowerCase() === serverId.toLowerCase()
  );

  if (!server) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Server Not Found')
      .setDescription(`Server with identifier \`${serverId}\` was not found or doesn't belong to you.`)
      .addFields(
        { 
          name: '💡 Tip', 
          value: 'Use `!monitor` without parameters to see usage guide, or use `!servers` to list all your servers.',
          inline: false 
        }
      )
      .setTimestamp();

    await message.reply({ 
      embeds: [embed],
      allowedMentions: { repliedUser: false }
    });
    return;
  }

  // Show loading message
  const loadingEmbed = new EmbedBuilder()
    .setColor('Yellow')
    .setTitle('📊 Loading Resource Data...')
    .setDescription(`Fetching resource usage for server **${server.name}**...`)
    .setTimestamp();

  const loadingMessage = await message.reply({ 
    embeds: [loadingEmbed],
    allowedMentions: { repliedUser: false }
  });
  try {    // Get server details and resource usage
    const [serverDetails, resourceUsage] = await Promise.all([
      pterodactylService.getServerDetails(server.uuid),
      pterodactylService.getServerResourceUsage(server.uuid)
    ]);

    // Extract resources from nested structure
    const resources = resourceUsage.resources || {};
    // Get status from resource usage (more accurate than server details)
    const serverStatus = resourceUsage.current_state || serverDetails.status || 'unknown';

    // Format resource data
    const resourceEmbed = new EmbedBuilder()
      .setColor(getResourceColor(resources))
      .setTitle('📊 Server Resource Monitor')
      .setDescription(`Current resource usage for **${server.name}** (captured at execution time)`)
      .addFields(
        { 
          name: '🏷️ Server Information', 
          value: `**Name:** ${server.name}\n**Status:** ${getStatusEmoji(serverStatus)} ${serverStatus}\n**UUID:** \`${server.uuid.substring(0, 8)}...\``,
          inline: false 
        },
        { 
          name: '💾 Memory Usage', 
          value: formatMemoryUsage(resources.memory_bytes, server.limits?.memory),
          inline: true 
        },
        { 
          name: '⚡ CPU Usage', 
          value: formatCpuUsage(resources.cpu_absolute, server.limits?.cpu),
          inline: true 
        },
        { 
          name: '💽 Disk Usage', 
          value: formatDiskUsage(resources.disk_bytes, server.limits?.disk),
          inline: true 
        },
        { 
          name: '🌐 Network I/O', 
          value: `**↗️ TX:** ${formatBytes(resources.network_tx_bytes)}\n**↙️ RX:** ${formatBytes(resources.network_rx_bytes)}`,
          inline: true 
        },
        { 
          name: '💿 Disk I/O', 
          value: `**📤 Write:** ${formatBytes(resources.disk_io_write_bytes || 0)}\n**📥 Read:** ${formatBytes(resources.disk_io_read_bytes || 0)}`,
          inline: true 
        },
        { 
          name: '🔄 Uptime', 
          value: formatUptime(resources.uptime),
          inline: true 
        }
      )
      .setTimestamp()
      .setFooter({ text: 'Data refreshed' });

    await loadingMessage.edit({ embeds: [resourceEmbed] });

    Logger.info(`User ${message.author.tag} monitored resources for server: ${server.name} (${server.uuid})`);

  } catch (error) {
    Logger.error('Error fetching server resources:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Resource Monitoring Failed')
      .setDescription(`Failed to fetch resource data for server **${server.name}**.`)
      .addFields(
        { 
          name: '🔍 Error Details', 
          value: error instanceof Error ? error.message : 'Unknown error occurred',
          inline: false 
        },
        {
          name: '💡 Possible Causes',
          value: '• Server is offline\n• Resource monitoring unavailable\n• API connection issues',
          inline: false
        }
      )
      .setTimestamp();

    await loadingMessage.edit({ embeds: [errorEmbed] });
  }
}

// Utility functions
function formatMemoryUsage(usedBytes: number, limitMB?: number): string {
  if (!usedBytes && usedBytes !== 0) {
    return 'No data available';
  }
  
  const usedMB = Math.round(usedBytes / 1024 / 1024);
  
  // Use appropriate unit based on size
  let usedDisplay: string;
  if (usedMB < 1024) {
    usedDisplay = `${usedMB}MiB`;
  } else {
    const usedGB = (usedBytes / 1024 / 1024 / 1024).toFixed(1);
    usedDisplay = `${usedGB}GiB`;
  }
  
  if (!limitMB || limitMB === 0) {
    return `${usedDisplay} of unlimited\n\`∞ Unlimited\``;
  }
  
  const percentage = Math.round((usedMB / limitMB) * 100);
  
  // Format limit with appropriate unit
  let limitDisplay: string;
  if (limitMB < 1024) {
    limitDisplay = `${limitMB}MiB`;
  } else {
    const limitGB = (limitMB / 1024).toFixed(1);
    limitDisplay = `${limitGB}GiB`;
  }
  
  return `${usedDisplay} / ${limitDisplay}\n\`${percentage}% used\` ${getUsageBar(percentage)}`;
}

function formatCpuUsage(cpuUsage: number, limitPercent?: number): string {
  if (!cpuUsage && cpuUsage !== 0) {
    return 'No data available';
  }
  
  const currentPercent = Math.round(cpuUsage);
  
  if (!limitPercent || limitPercent === 0) {
    return `${currentPercent}% of unlimited\n\`∞ Unlimited\``;
  }
  
  const usagePercent = Math.round((cpuUsage / limitPercent) * 100);
  
  return `${currentPercent}% / ${limitPercent}%\n\`${usagePercent}% of limit\` ${getUsageBar(usagePercent)}`;
}

function formatDiskUsage(usedBytes: number, limitMB?: number): string {
  if (!usedBytes && usedBytes !== 0) {
    return 'No data available';
  }
  
  const usedMB = Math.round(usedBytes / 1024 / 1024);
  
  // Use appropriate unit based on size
  let usedDisplay: string;
  if (usedMB < 1024) {
    usedDisplay = `${usedMB}MiB`;
  } else {
    const usedGB = (usedBytes / 1024 / 1024 / 1024).toFixed(1);
    usedDisplay = `${usedGB}GiB`;
  }
  
  if (!limitMB || limitMB === 0) {
    return `${usedDisplay} of unlimited\n\`∞ Unlimited\``;
  }
  
  const percentage = Math.round((usedMB / limitMB) * 100);
  
  // Format limit with appropriate unit
  let limitDisplay: string;
  if (limitMB < 1024) {
    limitDisplay = `${limitMB}MiB`;
  } else {
    const limitGB = (limitMB / 1024).toFixed(1);
    limitDisplay = `${limitGB}GiB`;
  }
  
  return `${usedDisplay} / ${limitDisplay}\n\`${percentage}% used\` ${getUsageBar(percentage)}`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0B';
  
  const k = 1024;
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))}${sizes[i]}`;
}

function formatUptime(milliseconds: number): string {
  if (milliseconds === 0) return 'Offline';
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function getUsageBar(percentage: number): string {
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  
  let bar = '';
  for (let i = 0; i < filled; i++) {
    bar += '█';
  }
  for (let i = 0; i < empty; i++) {
    bar += '░';
  }
  
  return bar;
}

function getResourceColor(resources: any): number {
  // Default to blue if we can't determine usage levels
  let maxUsage = 0;
  
  // Check memory usage if available
  if (resources.memory_bytes && resources.memory_limit) {
    maxUsage = Math.max(maxUsage, (resources.memory_bytes / resources.memory_limit) * 100);
  }
  
  // Check CPU usage if available
  if (resources.cpu_absolute) {
    maxUsage = Math.max(maxUsage, resources.cpu_absolute);
  }
  
  // Return color based on highest usage
  if (maxUsage >= 90) return 0xFF0000; // Red - Critical
  if (maxUsage >= 75) return 0xFFA500; // Orange - High
  if (maxUsage >= 50) return 0xFFFF00; // Yellow - Medium
  return 0x00FF00; // Green - Low/Good
}

function getStatusEmoji(status: string): string {
  if (!status) {
    return '❓'; // Unknown status
  }
  
  switch (status.toLowerCase()) {
    case 'running': return '🟢';
    case 'offline': return '🔴';
    case 'starting': return '🟡';
    case 'stopping': return '🟠';
    case 'stopped': return '🔴';
    case 'unknown': return '❓';
    default: return '⚫';
  }
}
