import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ComponentType,
  Message,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { AuthService } from '../services/auth';
import { PterodactylService } from '../services/pterodactyl';
import { Logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('create-server')
  .setDescription('Create a new Pterodactyl server')
  .addStringOption(option =>
    option.setName('name')
      .setDescription('Server name')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('memory')
      .setDescription('Memory in MB (e.g., 1024)')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('disk')
      .setDescription('Disk space in MB (e.g., 5120)')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('cpu')
      .setDescription('CPU percentage (e.g., 100)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('description')
      .setDescription('Server description')
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
    
    const name = interaction.options.getString('name', true);
    const description = interaction.options.getString('description') || '';
    const memory = interaction.options.getInteger('memory', true);
    const disk = interaction.options.getInteger('disk', true);
    const cpu = interaction.options.getInteger('cpu', true);

    // Set admin API key to get eggs and nodes
    pterodactylService.setAdminApiKey();    // Get available eggs and nodes
    let eggs, nodes;
    try {
      [eggs, nodes] = await Promise.all([
        pterodactylService.getEggs(),
        pterodactylService.getNodes()
      ]);
    } catch (error) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ Error')
        .setDescription('Failed to fetch available server options. Please try again later.')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Filter out undefined or incomplete eggs before using them
    const validEggs = eggs.filter(
      (egg: any) => egg && egg.id && egg.name && egg.nest_name
    );

    if (validEggs.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ No Valid Server Types Available')
        .setDescription('No valid server types are currently available.')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (nodes.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ No Nodes Available')
        .setDescription('No nodes are currently available for server deployment.')
        .setTimestamp();      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Step 1: Node Selection
    const nodeSelectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_node')
      .setPlaceholder('Choose a node/location')      .addOptions(
        nodes.filter(node => node && (node.name || node.attributes?.name) && (node.id || node.attributes?.id)).slice(0, 25).map(node => ({
          label: `${node.name || node.attributes?.name} (${node.location_id || node.attributes?.location_id})`,
          description: `${(node.memory || node.attributes?.memory) - ((node.allocated_resources?.memory || node.attributes?.allocated_resources?.memory) || 0)}MB RAM available`,
          value: (node.id || node.attributes?.id).toString(),
        }))
      );

    const nodeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(nodeSelectMenu);

    const nodeEmbed = new EmbedBuilder()
      .setColor('Blue')
      .setTitle('🌍 Select Node/Location')
      .setDescription('Please select a node where your server will be deployed:')
      .addFields(
        { name: 'Server Name', value: name, inline: true },
        { name: 'Memory', value: `${memory} MB`, inline: true },
        { name: 'Disk', value: `${disk} MB`, inline: true },
        { name: 'CPU', value: `${cpu}%`, inline: true }
      )
      .setTimestamp();

    const nodeResponse = await interaction.editReply({
      embeds: [nodeEmbed],
      components: [nodeRow]
    });

    let selectedNodeId: number;

    try {
      const nodeInteraction = await nodeResponse.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: i => i.user.id === interaction.user.id,
        time: 60000
      });

      await nodeInteraction.deferUpdate();
      selectedNodeId = parseInt(nodeInteraction.values[0]);

      // Step 2: Egg Selection
      const eggSelectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_egg')
        .setPlaceholder('Choose a server type')
        .addOptions(
          validEggs.slice(0, 25).map(egg => ({
            label: `${egg.name} (${egg.nest_name})`,
            description: egg.description?.substring(0, 80) || `From ${egg.nest_name} nest`,
            value: egg.id.toString(),
          }))
        );

      const eggRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(eggSelectMenu);

      const eggEmbed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('🥚 Select Server Type')
        .setDescription('Please select a server type from the dropdown menu:')
        .addFields(
          { name: 'Server Name', value: name, inline: true },          { name: 'Memory', value: `${memory} MB`, inline: true },
          { name: 'Disk', value: `${disk} MB`, inline: true },
          { name: 'CPU', value: `${cpu}%`, inline: true },
          { name: 'Node', value: nodes.find(n => (n.id || n.attributes?.id) === selectedNodeId)?.name || nodes.find(n => (n.id || n.attributes?.id) === selectedNodeId)?.attributes?.name || 'Unknown', inline: true }
        )
        .setTimestamp();

      await nodeInteraction.editReply({
        embeds: [eggEmbed],
        components: [eggRow]
      });      const eggInteraction = await nodeResponse.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: i => i.user.id === interaction.user.id,
        time: 60000
      });      const selectedEggId = parseInt(eggInteraction.values[0]);
      const selectedNode = nodes.find(n => (n.id || n.attributes?.id) === selectedNodeId);
      const selectedEgg = validEggs.find(e => e.id === selectedEggId);

      // Defer the interaction for server creation
      await eggInteraction.deferUpdate();

      // Create server (smart defaults handled in service)
      const server = await pterodactylService.createServer({
        name,
        description,
        memory,
        disk,
        cpu,
        egg: selectedEggId,
        location: selectedNode?.location_id || selectedNode?.attributes?.location_id || 1,
        allocation: selectedNode?.id || selectedNode?.attributes?.id || 1,
        user: context.user.pterodactyl_user_id
      });

      // Add to database
      (authService as any).db.addUserServer(interaction.user.id, server.uuid, server.name);

      const successEmbed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('✅ Server Created Successfully')
        .setDescription(`Your server **${server.name}** has been created!`)
        .addFields(
          { name: '🆔 Server ID', value: server.uuid, inline: true },
          { name: '📊 Status', value: server.status || 'Installing', inline: true },
          { name: '💾 Memory', value: `${server.limits.memory} MB`, inline: true },
          { name: '💿 Disk', value: `${server.limits.disk} MB`, inline: true },
          { name: '⚡ CPU', value: `${server.limits.cpu}%`, inline: true },
          { name: '🌍 Node', value: selectedNode?.name || selectedNode?.attributes?.name || 'Unknown', inline: true },
          { name: '🥚 Type', value: `${selectedEgg?.name} (${selectedEgg?.nest_name})`, inline: true }
        )
        .setFooter({ text: 'Server is installing. This may take a few minutes. Startup commands are auto-configured.' })
        .setTimestamp();

      await eggInteraction.editReply({
        embeds: [successEmbed],
        components: []
      });Logger.info(`User ${interaction.user.tag} created server: ${server.name} (${server.uuid}) on node ${selectedNode?.name || selectedNode?.attributes?.name || 'Unknown'}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('time')) {
        const timeoutEmbed = new EmbedBuilder()
          .setColor('Orange')
          .setTitle('⏰ Selection Timeout')
          .setDescription('Server creation cancelled due to timeout.')
          .setTimestamp();

        await interaction.editReply({
          embeds: [timeoutEmbed],
          components: []
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    Logger.error('Error in create-server command:', error);
    
    let errorMessage = 'An error occurred while creating the server.';
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
      } else if (error.message.includes('Validation failed')) {
        title = '⚠️ Invalid Server Configuration';
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
      await interaction.editReply({ embeds: [embed], components: [] });
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
    
    // Check for required arguments
    if (args.length < 4) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ Invalid Usage')
        .setDescription('Missing required arguments!')
        .addFields(
          { 
            name: 'Usage', 
            value: '`!create-server <name> <memory_mb> <disk_mb> <cpu_percent> [description]`',
            inline: false 
          },
          { 
            name: 'Example', 
            value: '`!create-server MyServer 1024 5120 100 "My awesome server"`',
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

    const name = args[0];
    const memory = parseInt(args[1]);
    const disk = parseInt(args[2]);
    const cpu = parseInt(args[3]);
    let description = args.slice(4).join(' ') || undefined;

    // Validate numeric inputs
    if (isNaN(memory) || isNaN(disk) || isNaN(cpu)) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ Invalid Input')
        .setDescription('Memory, disk, and CPU must be valid numbers!')
        .setTimestamp();

      await message.reply({ 
        embeds: [embed],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    // Set admin API key to get eggs and nodes
    pterodactylService.setAdminApiKey();

    // Get available eggs and nodes
    let eggs, nodes;
    try {
      [eggs, nodes] = await Promise.all([
        pterodactylService.getEggs(),
        pterodactylService.getNodes()
      ]);
    } catch (error) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ Error')
        .setDescription('Failed to fetch available server options. Please try again later.')
        .setTimestamp();

      await message.reply({ 
        embeds: [embed],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    // Filter out undefined or incomplete eggs before using them
    const validEggs = eggs.filter(
      (egg: any) => egg && egg.id && egg.name && egg.nest_name
    );

    if (validEggs.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ No Valid Server Types Available')
        .setDescription('No valid server types are currently available.')
        .setTimestamp();

      await message.reply({ 
        embeds: [embed],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    if (nodes.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ No Nodes Available')
        .setDescription('No nodes are currently available for server deployment.')
        .setTimestamp();

      await message.reply({ 
        embeds: [embed],
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    // Step 1: Node Selection
    const nodeSelectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_node')
      .setPlaceholder('Choose a node/location')
      .addOptions(
        nodes.filter(node => node && (node.name || node.attributes?.name) && (node.id || node.attributes?.id)).slice(0, 25).map(node => ({
          label: `${node.name || node.attributes?.name} (${node.location_id || node.attributes?.location_id})`,
          description: `${(node.memory || node.attributes?.memory) - ((node.allocated_resources?.memory || node.attributes?.allocated_resources?.memory) || 0)}MB RAM available`,
          value: (node.id || node.attributes?.id).toString(),
        }))
      );

    const nodeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(nodeSelectMenu);

    const nodeEmbed = new EmbedBuilder()
      .setColor('Blue')
      .setTitle('🌍 Select Node/Location')
      .setDescription('Please select a node where your server will be deployed:')
      .addFields(
        { name: 'Server Name', value: name, inline: true },
        { name: 'Memory', value: `${memory} MB`, inline: true },
        { name: 'Disk', value: `${disk} MB`, inline: true },
        { name: 'CPU', value: `${cpu}%`, inline: true }
      )
      .setTimestamp();

    const nodeResponse = await message.reply({
      embeds: [nodeEmbed],
      components: [nodeRow],
      allowedMentions: { repliedUser: false }
    });

    let selectedNodeId: number;

    try {
      const nodeInteraction = await nodeResponse.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: i => i.user.id === message.author.id,
        time: 60000
      });

      await nodeInteraction.deferUpdate();
      selectedNodeId = parseInt(nodeInteraction.values[0]);

      // Step 2: Egg Selection
      const eggSelectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_egg')
        .setPlaceholder('Choose a server type')
        .addOptions(
          validEggs.slice(0, 25).map(egg => ({
            label: `${egg.name} (${egg.nest_name})`,
            description: egg.description?.substring(0, 80) || `From ${egg.nest_name} nest`,
            value: egg.id.toString(),
          }))
        );

      const eggRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(eggSelectMenu);

      const eggEmbed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('🥚 Select Server Type')
        .setDescription('Please select a server type from the dropdown menu:')
        .addFields(
          { name: 'Server Name', value: name, inline: true },
          { name: 'Memory', value: `${memory} MB`, inline: true },
          { name: 'Disk', value: `${disk} MB`, inline: true },
          { name: 'CPU', value: `${cpu}%`, inline: true },
          { name: 'Node', value: nodes.find(n => (n.id || n.attributes?.id) === selectedNodeId)?.name || nodes.find(n => (n.id || n.attributes?.id) === selectedNodeId)?.attributes?.name || 'Unknown', inline: true }
        )
        .setTimestamp();

      await nodeInteraction.editReply({
        embeds: [eggEmbed],
        components: [eggRow]
      });

      const eggInteraction = await nodeResponse.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: i => i.user.id === message.author.id,
        time: 60000
      });

      const selectedEggId = parseInt(eggInteraction.values[0]);
      const selectedNode = nodes.find(n => (n.id || n.attributes?.id) === selectedNodeId);
      const selectedEgg = validEggs.find(e => e.id === selectedEggId);

      // Defer the interaction for server creation
      await eggInteraction.deferUpdate();

      // Create server (smart defaults handled in service)
      const server = await pterodactylService.createServer({
        name,
        description,
        memory,
        disk,
        cpu,
        egg: selectedEggId,
        location: selectedNode?.location_id || selectedNode?.attributes?.location_id || 1,
        allocation: selectedNode?.id || selectedNode?.attributes?.id || 1,
        user: context.user.pterodactyl_user_id
      });

      // Add to database
      (authService as any).db.addUserServer(message.author.id, server.uuid, server.name);

      const successEmbed = new EmbedBuilder()
        .setColor('Green')
        .setTitle('✅ Server Created Successfully')
        .setDescription(`Your server **${server.name}** has been created!`)
        .addFields(
          { name: '🆔 Server ID', value: server.uuid, inline: true },
          { name: '📊 Status', value: server.status || 'Installing', inline: true },
          { name: '💾 Memory', value: `${server.limits.memory} MB`, inline: true },
          { name: '💿 Disk', value: `${server.limits.disk} MB`, inline: true },
          { name: '⚡ CPU', value: `${server.limits.cpu}%`, inline: true },
          { name: '🌍 Node', value: selectedNode?.name || selectedNode?.attributes?.name || 'Unknown', inline: true },
          { name: '🥚 Type', value: `${selectedEgg?.name} (${selectedEgg?.nest_name})`, inline: true }
        )
        .setFooter({ text: 'Server is installing. This may take a few minutes. Startup commands are auto-configured.' })
        .setTimestamp();

      await eggInteraction.editReply({
        embeds: [successEmbed],
        components: []
      });

      Logger.info(`User ${message.author.tag} created server: ${server.name} (${server.uuid}) on node ${selectedNode?.name || selectedNode?.attributes?.name || 'Unknown'}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('time')) {
        const timeoutEmbed = new EmbedBuilder()
          .setColor('Orange')
          .setTitle('⏰ Selection Timeout')
          .setDescription('Server creation cancelled due to timeout.')
          .setTimestamp();

        await nodeResponse.edit({
          embeds: [timeoutEmbed],
          components: []
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    Logger.error('Error in create-server command (prefix):', error);
    
    let errorMessage = 'An error occurred while creating the server.';
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
      } else if (error.message.includes('Validation failed')) {
        title = '⚠️ Invalid Server Configuration';
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

    await message.reply({ 
      embeds: [embed],
      allowedMentions: { repliedUser: false }
    });
  }
}
