import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  Message
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

    // Unbind the user
    await authService.unbindUser(interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor('Green')
      .setTitle('✅ Account Unbound Successfully')
      .setDescription('Your Discord account has been successfully unbound from your Pterodactyl account.')
      .addFields(
        { name: 'Note', value: 'You will need to use `/bind` again to access server management features.' }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    Logger.info(`User ${interaction.user.tag} unbound their account`);

  } catch (error) {
    Logger.error('Error in unbind command:', error);
    
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Error')
      .setDescription('An error occurred while unbinding your account. Please try again later.')
      .setTimestamp();

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });    }
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

    // Confirmation prompt
    const confirmEmbed = new EmbedBuilder()
      .setColor('Orange')
      .setTitle('⚠️ Confirm Account Unbinding')
      .setDescription('Are you sure you want to unbind your Discord account from your Pterodactyl account?')
      .addFields(
        { 
          name: 'What happens when you unbind:', 
          value: '• You will lose access to all server management commands\n• You will need to use `!bind` again to regain access\n• Your servers will remain intact',
          inline: false 
        }
      )
      .setTimestamp()
      .setFooter({ text: 'React with ✅ to confirm or ❌ to cancel (30 seconds)' });

    const confirmMessage = await message.reply({ 
      embeds: [confirmEmbed],
      allowedMentions: { repliedUser: false }
    });
    
    // Add reactions
    await confirmMessage.react('✅');
    await confirmMessage.react('❌');

    // Wait for reaction
    const filter = (reaction: any, user: any) => {
      return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
    };

    const collected = await confirmMessage.awaitReactions({ filter, max: 1, time: 30000, errors: ['time'] });
    
    if (collected.size === 0) {
      const timeoutEmbed = new EmbedBuilder()
        .setColor('Grey')
        .setTitle('⏰ Confirmation Timeout')
        .setDescription('Account unbinding cancelled due to no response.')
        .setTimestamp();

      await confirmMessage.edit({ embeds: [timeoutEmbed] });
      return;
    }

    const reaction = collected.first();
    
    if (reaction?.emoji.name === '❌') {
      const cancelEmbed = new EmbedBuilder()
        .setColor('Grey')
        .setTitle('❌ Unbinding Cancelled')
        .setDescription('Account unbinding has been cancelled.')
        .setTimestamp();

      await confirmMessage.edit({ embeds: [cancelEmbed] });
      return;
    }

    // Proceed with unbinding
    await authService.unbindUser(message.author.id);

    const embed = new EmbedBuilder()
      .setColor('Green')
      .setTitle('✅ Account Unbound Successfully')
      .setDescription('Your Discord account has been successfully unbound from your Pterodactyl account.')
      .addFields(
        { name: 'Note', value: 'You will need to use `!bind` again to access server management features.' }
      )
      .setTimestamp();

    await confirmMessage.edit({ embeds: [embed] });
    Logger.info(`User ${message.author.tag} unbound their account`);
  } catch (error) {
    if (error instanceof Error && error.message?.includes('time')) {
      // Timeout error already handled above
      return;
    }

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
