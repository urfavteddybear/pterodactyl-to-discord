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
import { PterodactylService } from '../services/pterodactyl';
import { Logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('servers')
  .setDescription('View your servers');

export async function execute(
  interaction: ChatInputCommandInteraction,
  authService: AuthService,
  pterodactylService: PterodactylService
) {
  try {
    await interaction.deferReply();

    // Check if user is authenticated
    const context = await authService.requireAuth(interaction.user, interaction.member as any);
    
    // Set user API key
    pterodactylService.setUserApiKey(context.user.pterodactyl_api_key);    // Get user servers
    const servers = await pterodactylService.getUserServers();

    if (servers.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('Blue')
        .setTitle('📋 Your Servers')
        .setDescription('You don\'t have any servers yet. Use `/create-server` to create one!')
        .addFields(
          { name: 'Getting Started', value: 'Use `/create-server` to create a new server with custom specifications.', inline: false }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }    // Show servers with pagination
    await showServersWithPagination(interaction, servers, 0);
  } catch (error) {
    Logger.error('Error in servers command:', error);
    
    let errorMessage = 'An error occurred while fetching your servers.';
    let title = '❌ Error';
    
    // Handle specific error types with prettier messages
    if (error instanceof Error) {
      if (error.message.includes('bind your account first')) {
        title = '🔗 Account Not Bound';
        errorMessage = 'You need to bind your Discord account to your Pterodactyl account first!\n\nUse `/bind <your_api_key>` to get started.';
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

export async function executePrefix(
  message: Message,
  args: string[],
  authService: AuthService,
  pterodactylService: PterodactylService
) {
  try {
    // Check if user is authenticated
    const context = await authService.requireAuth(message.author, message.member as any);
    
    // Set user API key
    pterodactylService.setUserApiKey(context.user.pterodactyl_api_key);    // Get user servers
    const servers = await pterodactylService.getUserServers();

    if (servers.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('Blue')
        .setTitle('📋 Your Servers')
        .setDescription('You don\'t have any servers yet. Use `!create-server` to create one!')
        .addFields(
          { name: 'Getting Started', value: 'Use `!create-server` to create a new server with custom specifications.', inline: false }
        )
        .setTimestamp();

      await message.reply({ 
        embeds: [embed],
        allowedMentions: { repliedUser: false }
      });
      return;
    }    // Show servers with pagination
    await showServersWithPagination(message, servers, 0);
  } catch (error) {
    Logger.error('Error in servers command (prefix):', error);
    
    let errorMessage = 'An error occurred while fetching your servers.';
    let title = '❌ Error';
    
    // Handle specific error types with prettier messages
    if (error instanceof Error) {
      if (error.message.includes('bind your account first')) {
        title = '🔗 Account Not Bound';
        errorMessage = 'You need to bind your Discord account to your Pterodactyl account first!\n\nUse `!bind <your_api_key>` to get started.';
      } else if (error.message.includes('Invalid API key')) {
        title = '🔑 Invalid API Key';
        errorMessage = 'Your API key appears to be invalid or expired. Please use `!bind` with a new API key.';
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

    await message.reply({ 
      embeds: [embed],
      allowedMentions: { repliedUser: false }
    });
  }
}

async function showServersWithPagination(interactionOrMessage: any, servers: any[], page: number) {
  const serversPerPage = 5;
  const totalPages = Math.ceil(servers.length / serversPerPage);
  const startIndex = page * serversPerPage;
  const endIndex = startIndex + serversPerPage;
  const currentServers = servers.slice(startIndex, endIndex);

  // Create embed with server list (not grid)
  const embed = new EmbedBuilder()
    .setColor('Blue')
    .setTitle('🎮 Your Servers')
    .setDescription(`**Total servers:** ${servers.length} | **Page ${page + 1} of ${totalPages}**\n\n${
      currentServers.map((server: any, index: number) => {
        const statusEmoji = getStatusEmoji(server.status);
        return `**${startIndex + index + 1}.** ${statusEmoji} **${server.name}**\n` +
               `└ **Status:** ${server.status || 'Unknown'}\n` +
               `└ **Resources:** ${server.limits?.memory || 'N/A'}MB RAM • ${server.limits?.disk || 'N/A'}MB Disk • ${server.limits?.cpu || 'N/A'}% CPU\n` +
               `└ **UUID:** \`${server.uuid?.substring(0, 8) || 'N/A'}...\`\n`;
      }).join('\n')
    }`)
    .setTimestamp()
    .setFooter({ text: `Showing ${currentServers.length} of ${servers.length} servers` });
  // Create navigation buttons
  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (totalPages > 1) {
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`servers_prev_${page}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId(`servers_page_${page}`)
          .setLabel(`Page ${page + 1}/${totalPages}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`servers_next_${page}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === totalPages - 1)
      );
    components.push(row);
  }
  let response;
  if (interactionOrMessage.editReply) {
    response = await interactionOrMessage.editReply({ embeds: [embed], components });  } else if (interactionOrMessage.reply) {
    response = await interactionOrMessage.reply({ 
      embeds: [embed], 
      components,
      allowedMentions: { repliedUser: false }
    });
  } else {
    return; // Invalid interaction/message type
  }

  // Handle pagination buttons
  if (totalPages > 1) {
    try {
      const targetResponse = response || (interactionOrMessage.fetchReply ? await interactionOrMessage.fetchReply() : null);
      if (!targetResponse) return;

      const collector = targetResponse.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i: any) => i.user.id === (interactionOrMessage.user?.id || interactionOrMessage.author?.id) && i.customId.startsWith('servers_'),
        time: 300000 // 5 minutes
      });      collector.on('collect', async (buttonInteraction: any) => {
        const [, action, currentPage] = buttonInteraction.customId.split('_');
        let newPage = parseInt(currentPage);

        if (action === 'prev' && newPage > 0) {
          newPage--;
        } else if (action === 'next' && newPage < totalPages - 1) {
          newPage++;
        }        await buttonInteraction.deferUpdate();
        
        // Create new embed and components for updated page (using same format as initial display)
        const startIndex = newPage * serversPerPage;
        const endIndex = Math.min(startIndex + serversPerPage, servers.length);
        const pageServers = servers.slice(startIndex, endIndex);

        const newEmbed = new EmbedBuilder()
          .setColor('Blue')
          .setTitle('🎮 Your Servers')
          .setDescription(`**Total servers:** ${servers.length} | **Page ${newPage + 1} of ${totalPages}**\n\n${
            pageServers.map((server: any, index: number) => {
              const statusEmoji = getStatusEmoji(server.status);
              return `**${startIndex + index + 1}.** ${statusEmoji} **${server.name}**\n` +
                     `└ **Status:** ${server.status || 'Unknown'}\n` +
                     `└ **Resources:** ${server.limits?.memory || 'N/A'}MB RAM • ${server.limits?.disk || 'N/A'}MB Disk • ${server.limits?.cpu || 'N/A'}% CPU\n` +
                     `└ **UUID:** \`${server.uuid?.substring(0, 8) || 'N/A'}...\`\n`;
            }).join('\n')
          }`)
          .setTimestamp()
          .setFooter({ text: `Showing ${pageServers.length} of ${servers.length} servers` });

        const newComponents = [];
        if (totalPages > 1) {
          const newRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`servers_prev_${newPage}`)
                .setLabel('◀ Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(newPage === 0),
              new ButtonBuilder()
                .setCustomId(`servers_page_${newPage}`)
                .setLabel(`Page ${newPage + 1}/${totalPages}`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId(`servers_next_${newPage}`)
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(newPage === totalPages - 1)
            );
          newComponents.push(newRow);
        }

        await buttonInteraction.editReply({ embeds: [newEmbed], components: newComponents });
      });

      collector.on('end', async () => {
        // Disable buttons when collector ends
        if (components.length > 0) {
          const disabledRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              components[0].components.map((button: any) => 
                ButtonBuilder.from(button).setDisabled(true)
              )
            );
          
          try {
            if (interactionOrMessage.editReply) {
              await interactionOrMessage.editReply({ components: [disabledRow] });
            }
          } catch (error) {
            // Ignore errors when editing expired interaction
          }
        }
      });
    } catch (error) {
      // Ignore errors related to interaction handling
    }
  }
}

function getStatusEmoji(status: string): string {
  switch (status?.toLowerCase()) {
    case 'running':
      return '🟢';
    case 'starting':
      return '🟡';
    case 'stopping':
      return '🟠';
    case 'stopped':
      return '🔴';
    case 'offline':
      return '⚫';
    default:
      return '⚪';
  }
}