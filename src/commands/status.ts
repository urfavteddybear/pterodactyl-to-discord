import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  Message
} from 'discord.js';
import { AuthService } from '../services/auth';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Check your account binding status');

export async function execute(
  interaction: ChatInputCommandInteraction,
  authService: AuthService
) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const boundUser = await authService.getBoundUser(interaction.user.id);
    
    if (boundUser) {
      const embed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('✅ Account Status')
        .setDescription('Your Discord account is bound to a Pterodactyl account.')
        .addFields(
          { name: 'Pterodactyl User ID', value: boundUser.pterodactyl_user_id.toString(), inline: true },
          { name: 'Bound Since', value: new Date(boundUser.bound_at).toLocaleDateString(), inline: true },
          { name: 'Available Commands', value: '`/servers` - Manage servers\n`/create-server` - Create new server\n`/delete-server` - Delete server (Admin only)\n`/unbind` - Unbind account', inline: false }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else {      const embed = new EmbedBuilder()
        .setColor('Orange')
        .setTitle('⚠️ Account Status')
        .setDescription('Your Discord account is not bound to any Pterodactyl account.')
        .addFields(
          { 
            name: '🔗 How to Bind Your Account', 
            value: '**Slash Command (Recommended):**\n`/bind method:"API Key Only" api_key:your_key_here`\n\n**Prefix Command:**\n`!bind your_api_key_here`\n\nOnly your API key is needed - no user ID required!', 
            inline: false 
          },
          {
            name: '🔑 Getting Your API Key',
            value: '1. Go to your Pterodactyl panel\n2. Account → API Credentials\n3. Create new API key\n4. Copy and use in bind command',
            inline: false
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

  } catch (error) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Error')
      .setDescription('An error occurred while checking your status.')
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
  try {
    const boundUser = await authService.getBoundUser(message.author.id);
    
    if (boundUser) {
      const embed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('✅ Account Status')
        .setDescription('Your Discord account is bound to a Pterodactyl account.')
        .addFields(
          { name: 'Pterodactyl User ID', value: boundUser.pterodactyl_user_id.toString(), inline: true },
          { name: 'Bound Since', value: new Date(boundUser.bound_at).toLocaleDateString(), inline: true },
          { name: 'Available Commands', value: '`/servers` or `!servers` - Manage servers\n`/create-server` - Create new server\n`/delete-server` - Delete server (Admin only)\n`/unbind` or `!unbind` - Unbind account', inline: false }
        )        .setTimestamp();

      await message.reply({ 
        embeds: [embed],
        allowedMentions: { repliedUser: false }
      });
    } else {const embed = new EmbedBuilder()
        .setColor('Orange')
        .setTitle('⚠️ Account Status')
        .setDescription('Your Discord account is not bound to any Pterodactyl account.')
        .addFields(
          { 
            name: '🔗 How to Bind Your Account', 
            value: '**Slash Command (Recommended):**\n`/bind method:"API Key Only" api_key:your_key_here`\n\n**Prefix Command:**\n`!bind your_api_key_here`\n\nOnly your API key is needed - no user ID required!', 
            inline: false 
          },
          {
            name: '🔑 Getting Your API Key',
            value: '1. Go to your Pterodactyl panel\n2. Account → API Credentials\n3. Create new API key\n4. Copy and use in bind command',
            inline: false          }
        )
        .setTimestamp();

      await message.reply({ 
        embeds: [embed],
        allowedMentions: { repliedUser: false }
      });
    }

  } catch (error) {
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Error')
      .setDescription('An error occurred while checking your status.')
      .setTimestamp();

    await message.reply({ 
      embeds: [embed],
      allowedMentions: { repliedUser: false }
    });
  }
}
