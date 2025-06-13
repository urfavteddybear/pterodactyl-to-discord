import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';
import { AuthService } from '../services/auth';
import { Logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('unbind')
  .setDescription('Unbind your Discord account from your Pterodactyl account');

export async function execute(
  interaction: ChatInputCommandInteraction,
  authService: AuthService
) {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Check if user is bound
    const isbound = await authService.isUserBound(interaction.user.id);
    
    if (!isbound) {
      const embed = new EmbedBuilder()
        .setColor('Orange')
        .setTitle('⚠️ Account Not Bound')
        .setDescription('Your Discord account is not currently bound to any Pterodactyl account.')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Get current user info for confirmation
    const currentUser = await authService.getBoundUser(interaction.user.id);

    // Confirmation prompt
    const confirmEmbed = new EmbedBuilder()
      .setColor('Orange')
      .setTitle('⚠️ Confirm Account Unbinding')
      .setDescription('Are you sure you want to unbind your Discord account from your Pterodactyl account?')
      .addFields(
        { 
          name: '📋 Current Binding', 
          value: `**User ID:** ${currentUser?.pterodactyl_user_id}\n**API Key:** \`${currentUser?.pterodactyl_api_key.substring(0, 8)}...\``, 
          inline: false 
        },
        { 
          name: '⚠️ What happens when you unbind:', 
          value: '• You will lose access to all server management commands\n• You will need to use `/bind` again to regain access\n• Your servers will remain intact on the panel',
          inline: false 
        }
      )
      .setTimestamp();

    const confirmButton = new ButtonBuilder()
      .setCustomId('unbind_confirm')
      .setLabel('✅ Yes, Unbind Account')
      .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
      .setCustomId('unbind_cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(confirmButton, cancelButton);

    const response = await interaction.editReply({ 
      embeds: [confirmEmbed], 
      components: [row] 
    });

    // Wait for button interaction
    try {
      const buttonInteraction = await response.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: i => i.user.id === interaction.user.id,
        time: 60000
      });

      if (buttonInteraction.customId === 'unbind_cancel') {
        const cancelEmbed = new EmbedBuilder()
          .setColor('Grey')
          .setTitle('❌ Unbinding Cancelled')
          .setDescription('Account unbinding has been cancelled. Your account remains bound.')
          .setTimestamp();

        await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
        return;
      }

      if (buttonInteraction.customId === 'unbind_confirm') {
        // Proceed with unbinding
        await authService.unbindUser(interaction.user.id);

        const successEmbed = new EmbedBuilder()
          .setColor('Green')
          .setTitle('✅ Account Unbound Successfully')
          .setDescription('Your Discord account has been successfully unbound from your Pterodactyl account.')
          .addFields(
            { 
              name: 'What\'s Next?', 
              value: 'You will need to use `/bind` again to access server management features.',
              inline: false 
            }
          )
          .setTimestamp();

        await buttonInteraction.update({ embeds: [successEmbed], components: [] });
        Logger.info(`User ${interaction.user.tag} unbound their account`);
      }

    } catch (error) {
      const timeoutEmbed = new EmbedBuilder()
        .setColor('Orange')
        .setTitle('⏰ Confirmation Timeout')
        .setDescription('Account unbinding cancelled due to timeout.')
        .setTimestamp();

      await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
    }

  } catch (error) {
    Logger.error('Error in unbind command:', error);
    
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Error')
      .setDescription('An error occurred while unbinding your account. Please try again later.')
      .setTimestamp();

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [embed], components: [] });
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
    // Check if user is bound
    const isbound = await authService.isUserBound(message.author.id);
    
    if (!isbound) {
      const embed = new EmbedBuilder()
        .setColor('Orange')
        .setTitle('⚠️ Account Not Bound')
        .setDescription('Your Discord account is not currently bound to any Pterodactyl account.')
        .setTimestamp();

      await message.reply({ 
        embeds: [embed],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    // Get current user info for confirmation
    const currentUser = await authService.getBoundUser(message.author.id);

    // Confirmation prompt
    const confirmEmbed = new EmbedBuilder()
      .setColor('Orange')
      .setTitle('⚠️ Confirm Account Unbinding')
      .setDescription('Are you sure you want to unbind your Discord account from your Pterodactyl account?')
      .addFields(
        { 
          name: '📋 Current Binding', 
          value: `**User ID:** ${currentUser?.pterodactyl_user_id}\n**API Key:** \`${currentUser?.pterodactyl_api_key.substring(0, 8)}...\``, 
          inline: false 
        },
        { 
          name: '⚠️ What happens when you unbind:', 
          value: '• You will lose access to all server management commands\n• You will need to use `!bind` again to regain access\n• Your servers will remain intact on the panel',
          inline: false 
        }
      )
      .setTimestamp();

    const confirmButton = new ButtonBuilder()
      .setCustomId('unbind_confirm_prefix')
      .setLabel('✅ Yes, Unbind Account')
      .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
      .setCustomId('unbind_cancel_prefix')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(confirmButton, cancelButton);

    const confirmMessage = await message.reply({ 
      embeds: [confirmEmbed],
      components: [row],
      allowedMentions: { repliedUser: false }
    });

    // Wait for button interaction
    try {
      const buttonInteraction = await confirmMessage.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: i => i.user.id === message.author.id,
        time: 60000
      });

      if (buttonInteraction.customId === 'unbind_cancel_prefix') {
        const cancelEmbed = new EmbedBuilder()
          .setColor('Grey')
          .setTitle('❌ Unbinding Cancelled')
          .setDescription('Account unbinding has been cancelled. Your account remains bound.')
          .setTimestamp();

        await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
        return;
      }

      if (buttonInteraction.customId === 'unbind_confirm_prefix') {
        // Proceed with unbinding
        await authService.unbindUser(message.author.id);

        const successEmbed = new EmbedBuilder()
          .setColor('Green')
          .setTitle('✅ Account Unbound Successfully')
          .setDescription('Your Discord account has been successfully unbound from your Pterodactyl account.')
          .addFields(
            { 
              name: 'What\'s Next?', 
              value: 'You will need to use `!bind` again to access server management features.',
              inline: false 
            }
          )
          .setTimestamp();

        await buttonInteraction.update({ embeds: [successEmbed], components: [] });
        Logger.info(`User ${message.author.tag} unbound their account`);
      }

    } catch (error) {
      const timeoutEmbed = new EmbedBuilder()
        .setColor('Orange')
        .setTitle('⏰ Confirmation Timeout')
        .setDescription('Account unbinding cancelled due to timeout.')
        .setTimestamp();

      await confirmMessage.edit({ embeds: [timeoutEmbed], components: [] });
    }

  } catch (error) {
    Logger.error('Error in unbind command (prefix):', error);
    
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Error')
      .setDescription('An error occurred while unbinding your account. Please try again later.')
      .setTimestamp();

    await message.reply({ 
      embeds: [embed],
      allowedMentions: { repliedUser: false }
    });
  }
}
