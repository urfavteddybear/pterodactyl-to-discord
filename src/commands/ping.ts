import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  Message
} from 'discord.js';
import { AuthService } from '../services/auth';
import { PterodactylService } from '../services/pterodactyl';

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

  const embed = new EmbedBuilder()
    .setColor('Blue')
    .setTitle('🏓 Pong!')
    .addFields(
      { name: 'Bot Latency', value: `${latency}ms`, inline: true },
      { name: 'API Latency', value: `${apiLatency}ms`, inline: true },
      { name: 'Status', value: '🟢 Online', inline: true }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export async function executePrefix(message: Message): Promise<void> {
  const sent = await message.reply('🏓 Pinging...');
  const latency = sent.createdTimestamp - message.createdTimestamp;
  const apiLatency = Math.round(message.client.ws.ping);

  const embed = new EmbedBuilder()
    .setColor('Blue')
    .setTitle('🏓 Pong!')
    .addFields(
      { name: 'Bot Latency', value: `${latency}ms`, inline: true },
      { name: 'API Latency', value: `${apiLatency}ms`, inline: true },
      { name: 'Status', value: '🟢 Online', inline: true }
    )
    .setTimestamp();

  await sent.edit({ content: '', embeds: [embed] });
}
