import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  Message
} from 'discord.js';
import { AuthService } from '../services/auth';
import { PterodactylService } from '../services/pterodactyl';

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check the bot\'s latency and status');

export async function execute(
  interaction: ChatInputCommandInteraction,
  authService: AuthService,
  pterodactylService: PterodactylService
) {
  const sent = await interaction.deferReply({ fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const apiLatency = Math.round(interaction.client.ws.ping);
  
  // Calculate uptime
  const uptime = process.uptime();
  const uptimeString = formatUptime(uptime);
  
  // Memory usage
  const memoryUsage = process.memoryUsage();
  const memoryUsed = Math.round(memoryUsage.heapUsed / 1024 / 1024);

  const embed = new EmbedBuilder()
    .setColor('Blue')
    .setTitle('🏓 Pong!')
    .addFields(
      { name: '⚡ Bot Latency', value: `${latency}ms`, inline: true },
      { name: '🌐 API Latency', value: `${apiLatency}ms`, inline: true },
      { name: '🟢 Status', value: 'Online', inline: true },
      { name: '⏱️ Uptime', value: uptimeString, inline: true },
      { name: '💾 Memory Usage', value: `${memoryUsed} MB`, inline: true },
      { name: '👥 Guilds', value: `${interaction.client.guilds.cache.size}`, inline: true }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export async function executePrefix(message: Message): Promise<void> {
  const sent = await message.reply('🏓 Pinging...');
  const latency = sent.createdTimestamp - message.createdTimestamp;
  const apiLatency = Math.round(message.client.ws.ping);
  
  // Calculate uptime
  const uptime = process.uptime();
  const uptimeString = formatUptime(uptime);
  
  // Memory usage
  const memoryUsage = process.memoryUsage();
  const memoryUsed = Math.round(memoryUsage.heapUsed / 1024 / 1024);

  const embed = new EmbedBuilder()
    .setColor('Blue')
    .setTitle('🏓 Pong!')
    .addFields(
      { name: '⚡ Bot Latency', value: `${latency}ms`, inline: true },
      { name: '🌐 API Latency', value: `${apiLatency}ms`, inline: true },
      { name: '🟢 Status', value: 'Online', inline: true },
      { name: '⏱️ Uptime', value: uptimeString, inline: true },
      { name: '💾 Memory Usage', value: `${memoryUsed} MB`, inline: true },
      { name: '👥 Guilds', value: `${message.client.guilds.cache.size}`, inline: true }
    )
    .setTimestamp();

  await sent.edit({ content: '', embeds: [embed] });
}
