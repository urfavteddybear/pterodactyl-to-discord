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
          .setTitle('❌ Access Denied')
          .setDescription(`You can only delete servers that belong to you.\n\n**Available servers:**\n${userServers.map(s => `• **${s.name}** (UUID: \`${s.uuid.substring(0, 8)}...\`)`).join('\n') || 'No servers found'}`)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Direct deletion with server info
      await handleServerDeletion(interaction, server.uuid, pterodactylService, authService, server.name);
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
    const serverName = selectedServer ? selectedServer.name : selectedServerUuid;
    
    await handleServerDeletion(selectInteraction, selectedServerUuid, pterodactylService, authService, serverName);
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
    // Check if user is authenticated and admin
    const context = await authService.requireAdmin(message.author, message.member as any);
    
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
    }

    const serverIdentifier = args.join(' '); // Join in case server name has spaces

    // Set admin API key for server operations
    pterodactylService.setAdminApiKey();

    // Get all servers to find the one to delete
    const servers = await pterodactylService.getAllServers();
    
    // Find server by ID or name
    const server = servers.find((s: any) => 
      s.uuid === serverIdentifier || 
      s.id?.toString() === serverIdentifier ||
      s.name.toLowerCase() === serverIdentifier.toLowerCase()
    );

    if (!server) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ Server Not Found')
        .setDescription(`No server found with identifier: **${serverIdentifier}**`)
        .addFields(
          { 
            name: 'Search Criteria', 
            value: 'Searched by UUID, ID, and name (case-insensitive)',
            inline: false 
          }        )
        .setTimestamp();

      await message.reply({ 
        embeds: [embed],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    // Confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setColor('Orange')
      .setTitle('⚠️ Confirm Server Deletion')
      .setDescription(`Are you sure you want to delete this server? **This action cannot be undone!**`)
      .addFields(
        { name: '🏷️ Server Name', value: server.name, inline: true },
        { name: '🆔 Server ID', value: server.id.toString(), inline: true },
        { name: '🔗 UUID', value: server.uuid, inline: false },
        { name: '📊 Status', value: server.status || 'Unknown', inline: true },
        { name: '⚠️ Warning', value: '**All server data will be permanently lost!**', inline: false }
      )
      .setTimestamp()      .setFooter({ text: 'React with ✅ to confirm or ❌ to cancel (30 seconds)' });

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
        .setDescription('Server deletion cancelled due to no response.')
        .setTimestamp();

      await confirmMessage.edit({ embeds: [timeoutEmbed] });
      return;
    }

    const reaction = collected.first();
    
    if (reaction?.emoji.name === '❌') {
      const cancelEmbed = new EmbedBuilder()
        .setColor('Grey')
        .setTitle('❌ Deletion Cancelled')
        .setDescription('Server deletion has been cancelled.')
        .setTimestamp();

      await confirmMessage.edit({ embeds: [cancelEmbed] });
      return;
    }

    // Proceed with deletion
    const deletingEmbed = new EmbedBuilder()
      .setColor('Yellow')
      .setTitle('⏳ Deleting Server...')
      .setDescription(`Deleting server **${server.name}**...`)
      .setTimestamp();

    await confirmMessage.edit({ embeds: [deletingEmbed] });

    // Delete the server
    await pterodactylService.deleteServer(server.id);

    // Success embed
    const successEmbed = new EmbedBuilder()
      .setColor('Green')
      .setTitle('✅ Server Deleted Successfully')
      .setDescription(`Server **${server.name}** has been permanently deleted.`)
      .addFields(
        { name: '🏷️ Deleted Server', value: server.name, inline: true },
        { name: '🆔 Server ID', value: server.id.toString(), inline: true },
        { name: '🔗 UUID', value: server.uuid, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'Server and all associated data have been permanently removed.' });

    await confirmMessage.edit({ embeds: [successEmbed] });

    Logger.info(`User ${message.author.tag} deleted server: ${server.name} (${server.id})`);
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
      allowedMentions: { repliedUser: false }
    });
  }
}
