import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ComponentType,
  Message,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { AuthService } from '../services/auth';
import { PterodactylService } from '../services/pterodactyl';
import { Logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('delete-server')
  .setDescription('Delete one of your servers')
  .addStringOption(option =>
    option.setName('server_id')
      .setDescription('Server UUID (optional - will show selection if not provided)')
      .setRequired(false)
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  authService: AuthService,
  pterodactylService: PterodactylService
) {
  try {
    await interaction.deferReply();

    // Check if user is authenticated (removed admin requirement - users can delete their own servers)
    const context = await authService.requireAuth(interaction.user, interaction.member as any);
    
    const serverId = interaction.options.getString('server_id');    if (serverId) {
      // Verify ownership before deletion
      pterodactylService.setUserApiKey(context.user.pterodactyl_api_key);
      
      // Check ownership using both UUID and ID matching
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
              value: 'Use `/delete-server` without parameters to see your available servers.',
              inline: false 
            }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }// Show confirmation before deletion
      await showSlashConfirmation(interaction, server, pterodactylService, authService);
    } else {
      // Show server selection (only user's servers)
      await showServerSelection(interaction, context, pterodactylService, authService);
    }  } catch (error) {
    Logger.error('Error in delete-server command:', error);
    
    let errorMessage = 'An error occurred while deleting the server.';
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
      } else if (error.message.includes('not found')) {
        title = '🔍 Server Not Found';
        errorMessage = error.message;
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

async function showServerSelection(
  interaction: ChatInputCommandInteraction,
  context: any,
  pterodactylService: PterodactylService,
  authService: AuthService
) {
  // Set user API key
  pterodactylService.setUserApiKey(context.user.pterodactyl_api_key);

  // Get user servers
  const servers = await pterodactylService.getUserServers();

  if (servers.length === 0) {
    const embed = new EmbedBuilder()
      .setColor('Blue')
      .setTitle('📋 No Servers Found')
      .setDescription('You don\'t have any servers to delete.')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Create select menu for servers
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('select_server_delete')
    .setPlaceholder('Choose a server to delete')
    .addOptions(
      servers.slice(0, 25).map(server => ({
        label: server.name,
        description: `Status: ${server.status} | UUID: ${server.uuid.substring(0, 8)}...`,
        value: server.uuid,
      }))
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const embed = new EmbedBuilder()
    .setColor('Red')
    .setTitle('🗑️ Delete Server')
    .setDescription(`⚠️ **WARNING:** This will permanently delete the selected server!\n\nSelect a server to delete:`)
    .addFields(
      servers.slice(0, 10).map(server => ({
        name: server.name,
        value: `**Status:** ${server.status}\n**UUID:** \`${server.uuid}\``,
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
    });    const selectedServerUuid = selectInteraction.values[0];
    
    // Get the server info for the selected UUID
    const selectedServer = servers.find(s => s.uuid === selectedServerUuid);
    
    if (!selectedServer) {
      const errorEmbed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ Server Not Found')
        .setDescription('Selected server could not be found.')
        .setTimestamp();

      await selectInteraction.update({ embeds: [errorEmbed], components: [] });
      return;
    }
    
    // Show confirmation for selected server
    await selectInteraction.deferUpdate();
    await showSlashConfirmation(interaction, selectedServer, pterodactylService, authService);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage === 'Collector received no interactions before ending with reason: time') {
      const timeoutEmbed = new EmbedBuilder()
        .setColor('Orange')
        .setTitle('⏰ Selection Timeout')
        .setDescription('Server deletion cancelled due to timeout.')
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

async function showSlashConfirmation(
  interaction: ChatInputCommandInteraction,
  server: any,
  pterodactylService: PterodactylService,
  authService: AuthService
) {
  // Confirmation embed with buttons (same as prefix command)
  const confirmEmbed = new EmbedBuilder()
    .setColor('Orange')
    .setTitle('⚠️ Confirm Server Deletion')
    .setDescription(`Are you sure you want to delete this server? **This action cannot be undone!**`)
    .addFields(
      { name: '🏷️ Server Name', value: server.name, inline: true },
      { name: '📊 Status', value: server.status || 'Unknown', inline: true },
      { name: '🔗 UUID', value: server.uuid.substring(0, 8) + '...', inline: true },
      { name: '⚠️ Warning', value: '**All server data will be permanently lost!**', inline: false }
    )
    .setTimestamp();

  // Create confirmation buttons with unique IDs for slash commands
  const confirmButton = new ButtonBuilder()
    .setCustomId(`slash_confirm_delete_${server.uuid}`)
    .setLabel('✅ Confirm Delete')
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`slash_cancel_delete_${server.uuid}`)
    .setLabel('❌ Cancel')
    .setStyle(ButtonStyle.Secondary);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);

  const response = await interaction.editReply({
    embeds: [confirmEmbed],
    components: [buttonRow]
  });

  // Wait for button interaction
  try {
    const buttonInteraction = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id,
      time: 30000
    });

    if (buttonInteraction.customId === `slash_cancel_delete_${server.uuid}`) {
      const cancelEmbed = new EmbedBuilder()
        .setColor('Grey')
        .setTitle('❌ Deletion Cancelled')
        .setDescription('Server deletion has been cancelled.')
        .setTimestamp();

      await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
      return;
    }

    // Proceed with deletion (confirm button clicked)
    const deletingEmbed = new EmbedBuilder()
      .setColor('Yellow')
      .setTitle('⏳ Deleting Server...')
      .setDescription(`Deleting server **${server.name}**...`)
      .setTimestamp();

    await buttonInteraction.update({ embeds: [deletingEmbed], components: [] });

    // Delete the server
    await pterodactylService.deleteServer(server.uuid);
    
    // Remove from database
    (authService as any).db.removeUserServer(interaction.user.id, server.uuid);

    // Success embed
    const successEmbed = new EmbedBuilder()
      .setColor('Green')
      .setTitle('✅ Server Deleted Successfully')
      .setDescription(`Server **${server.name}** has been permanently deleted.`)
      .addFields(
        { name: '🗑️ Deleted Server', value: server.name, inline: true },
        { name: '🔗 UUID', value: server.uuid.substring(0, 8) + '...', inline: true }
      )
      .setTimestamp();

    await buttonInteraction.editReply({ embeds: [successEmbed], components: [] });

    Logger.info(`User ${interaction.user.tag} deleted server: ${server.name} (${server.uuid})`);

  } catch (interactionError) {
    const errorMessage = interactionError instanceof Error ? interactionError.message : 'Unknown error';
    if (errorMessage.includes('time')) {
      const timeoutEmbed = new EmbedBuilder()
        .setColor('Orange')
        .setTitle('⏰ Confirmation Timeout')
        .setDescription('Server deletion cancelled due to timeout.')
        .setTimestamp();

      await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
    } else {
      throw interactionError;
    }
  }
}

async function handleServerDeletion(
  interaction: any,
  serverId: string,
  pterodactylService: PterodactylService,
  authService: AuthService,
  serverName?: string
) {
  try {
    if (interaction.deferUpdate) {
      await interaction.deferUpdate();
    }

    // Delete the server (use server UUID for deletion)
    await pterodactylService.deleteServer(serverId);
    
    // Remove from database
    (authService as any).db.removeUserServer(interaction.user.id, serverId);

    const embed = new EmbedBuilder()
      .setColor('Green')
      .setTitle('✅ Server Deleted Successfully')
      .setDescription(`Server **${serverName || serverId}** has been successfully deleted.`)
      .addFields(
        { name: '🗑️ Deleted Server', value: serverName || 'Unknown', inline: true },
        { name: '🔗 UUID', value: serverId.substring(0, 8) + '...', inline: true }
      )
      .setTimestamp();

    if (interaction.editReply) {
      await interaction.editReply({ embeds: [embed], components: [] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }

    Logger.info(`User ${interaction.user.tag} deleted server: ${serverName || serverId}`);
  } catch (error) {
    Logger.error('Error deleting server:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Deletion Failed')
      .setDescription(`Failed to delete server: ${errorMessage}`)
      .setTimestamp();

    if (interaction.editReply) {
      await interaction.editReply({ embeds: [embed], components: [] });
    } else {
      await interaction.reply({ embeds: [embed] });
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
    // Check if user is authenticated (same as slash command - users can delete their own servers)
    const context = await authService.requireAuth(message.author, message.member as any);
    
    if (args.length === 0) {
      // Show usage information
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ Invalid Usage')
        .setDescription('You must provide a server ID or name to delete.')
        .addFields(
          { 
            name: 'Usage', 
            value: '`!delete-server <server_id_or_name>`',
            inline: false 
          },
          { 
            name: 'Example', 
            value: '`!delete-server MyServer` or `!delete-server 12345678`',
            inline: false 
          },
          {
            name: '⚠️ Warning',
            value: 'This action is **irreversible**! Make sure you have backups of any important data.',
            inline: false          }
        )
        .setTimestamp();

      await message.reply({ 
        embeds: [embed],
        allowedMentions: { repliedUser: false }
      });
      return;
    }    const serverIdentifier = args.join(' '); // Join in case server name has spaces

    // Set user API key (not admin) - same as slash command
    pterodactylService.setUserApiKey(context.user.pterodactyl_api_key);

    // Get user's servers only (not all servers)
    const servers = await pterodactylService.getUserServers();
    
    // Find server by ID, UUID, partial UUID, or name (same logic as slash command)
    const server = servers.find((s: any) => 
      s.uuid === serverIdentifier || 
      s.id?.toString() === serverIdentifier ||
      s.uuid.startsWith(serverIdentifier) || // Partial UUID match
      s.name.toLowerCase() === serverIdentifier.toLowerCase() // Name match
    );    if (!server) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ Server Not Found')
        .setDescription(`Server with identifier \`${serverIdentifier}\` was not found or doesn't belong to you.`)
        .addFields(
          { 
            name: '💡 Tip', 
            value: 'Use `!delete-server` without parameters to see available servers, or use `!servers` to list all your servers.',
            inline: false 
          }
        )
        .setTimestamp();

      await message.reply({ 
        embeds: [embed],
        allowedMentions: { repliedUser: false }
      });
      return;
    }// Confirmation embed with buttons
    const confirmEmbed = new EmbedBuilder()
      .setColor('Orange')
      .setTitle('⚠️ Confirm Server Deletion')
      .setDescription(`Are you sure you want to delete this server? **This action cannot be undone!**`)
      .addFields(
        { name: '🏷️ Server Name', value: server.name, inline: true },
        { name: '📊 Status', value: server.status || 'Unknown', inline: true },
        { name: '🔗 UUID', value: server.uuid.substring(0, 8) + '...', inline: true },
        { name: '⚠️ Warning', value: '**All server data will be permanently lost!**', inline: false }
      )
      .setTimestamp();    // Create confirmation buttons with unique IDs to avoid conflicts with global handler
    const confirmButton = new ButtonBuilder()
      .setCustomId(`prefix_confirm_delete_${server.uuid}`)
      .setLabel('✅ Confirm Delete')
      .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
      .setCustomId(`prefix_cancel_delete_${server.uuid}`)
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Secondary);

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);

    const confirmMessage = await message.reply({ 
      embeds: [confirmEmbed],
      components: [buttonRow],
      allowedMentions: { repliedUser: false }
    });    // Wait for button interaction
    try {
      const buttonInteraction = await confirmMessage.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: i => i.user.id === message.author.id,
        time: 30000
      });

      if (buttonInteraction.customId === `prefix_cancel_delete_${server.uuid}`) {
        const cancelEmbed = new EmbedBuilder()
          .setColor('Grey')
          .setTitle('❌ Deletion Cancelled')
          .setDescription('Server deletion has been cancelled.')
          .setTimestamp();

        await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
        return;
      }

      // Proceed with deletion (confirm button clicked)
      const deletingEmbed = new EmbedBuilder()
        .setColor('Yellow')
        .setTitle('⏳ Deleting Server...')
        .setDescription(`Deleting server **${server.name}**...`)
        .setTimestamp();

      await buttonInteraction.update({ embeds: [deletingEmbed], components: [] });

      // Delete the server (use UUID for deletion, same as slash command)
      await pterodactylService.deleteServer(server.uuid);
      
      // Remove from database (same as slash command)
      (authService as any).db.removeUserServer(message.author.id, server.uuid);

      // Success embed
      const successEmbed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('✅ Server Deleted Successfully')
        .setDescription(`Server **${server.name}** has been permanently deleted.`)
        .addFields(
          { name: '🗑️ Deleted Server', value: server.name, inline: true },
          { name: '🔗 UUID', value: server.uuid.substring(0, 8) + '...', inline: true }
        )
        .setTimestamp();

      await buttonInteraction.editReply({ embeds: [successEmbed], components: [] });

      Logger.info(`User ${message.author.tag} deleted server: ${server.name} (${server.uuid})`);

    } catch (interactionError) {
      const errorMessage = interactionError instanceof Error ? interactionError.message : 'Unknown error';
      if (errorMessage.includes('time')) {
        const timeoutEmbed = new EmbedBuilder()
          .setColor('Orange')
          .setTitle('⏰ Confirmation Timeout')
          .setDescription('Server deletion cancelled due to timeout.')
          .setTimestamp();

        await confirmMessage.edit({ embeds: [timeoutEmbed], components: [] });
      } else {
        throw interactionError;
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message?.includes('time')) {
      // Timeout error already handled above
      return;
    }

    Logger.error('Error in delete-server command (prefix):', error);
    
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while deleting the server.';
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Error')
      .setDescription(errorMessage)      .setTimestamp();

    await message.reply({ 
      embeds: [embed],
      allowedMentions: { repliedUser: false }    });
  }
}
