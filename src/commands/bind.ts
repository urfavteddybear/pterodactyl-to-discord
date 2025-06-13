import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,  ModalActionRowComponentBuilder,
  Message
} from 'discord.js';
import { AuthService } from '../services/auth';
import { PterodactylService } from '../services/pterodactyl';
import { Logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('bind')
  .setDescription('Bind your Discord account to your Pterodactyl account')
  .addStringOption(option =>
    option.setName('method')
      .setDescription('Binding method')
      .setRequired(true)
      .addChoices(
        { name: 'API Key Only (Recommended)', value: 'api_key' },
        { name: 'Email + API Key', value: 'email_api' },
        { name: 'Username + API Key', value: 'username_api' }
      )
  )
  .addStringOption(option =>
    option.setName('api_key')
      .setDescription('Your Pterodactyl client API key')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('identifier')
      .setDescription('Your email or username (only needed for email/username methods)')
      .setRequired(false)
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  authService: AuthService,
  pterodactylService: PterodactylService
) {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Check if user is already bound
    const isAlreadyBound = await authService.isUserBound(interaction.user.id);
    if (isAlreadyBound) {
      const currentUser = await authService.getBoundUser(interaction.user.id);
      const embed = new EmbedBuilder()
        .setColor('Orange')
        .setTitle('⚠️ Account Already Bound')
        .setDescription('Your Discord account is already bound to a Pterodactyl account!')
        .addFields(
          { 
            name: '📋 Current Binding', 
            value: `**User ID:** ${currentUser?.pterodactyl_user_id}\n**API Key:** \`${currentUser?.pterodactyl_api_key.substring(0, 8)}...\``, 
            inline: false 
          },
          {
            name: '🔄 To Bind a Different Account',
            value: 'You must first unbind your current account using `/unbind`, then use `/bind` again with your new credentials.',
            inline: false
          },
          {
            name: '📊 Check Current Status',
            value: 'Use `/status` to see your current binding information.',
            inline: false
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const method = interaction.options.getString('method', true);
    const apiKey = interaction.options.getString('api_key', true);
    const identifier = interaction.options.getString('identifier');

    // Verify the API key works and get user info
    pterodactylService.setUserApiKey(apiKey);
    
    let userInfo;
    try {
      // Try to get user info from the client API
      userInfo = await pterodactylService.getClientUserInfo();
    } catch (error) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ Invalid API Key')
        .setDescription('The provided API key is invalid or expired. Please check your API key and try again.')
        .addFields(
          { 
            name: 'How to get your API key:', 
            value: '1. Go to your Pterodactyl panel\n2. Click on your account (top right)\n3. Go to "API Credentials"\n4. Create a new API key\n5. Copy the key and use it here',
            inline: false 
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    let pterodactylUserId: number;

    switch (method) {
      case 'api_key':
        // Use the user info from the API key (most reliable method)
        pterodactylUserId = userInfo.id;
        break;

      case 'email_api':
        if (!identifier) {
          const embed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ Missing Email')
            .setDescription('Email is required when using the email + API key method.')
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        // Verify email matches the API key user
        if (userInfo.email.toLowerCase() !== identifier.toLowerCase()) {
          const embed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ Email Mismatch')
            .setDescription('The provided email does not match the API key owner.')
            .addFields(
              { name: 'Expected Email', value: userInfo.email, inline: true },
              { name: 'Provided Email', value: identifier, inline: true }
            )
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          return;
        }
        pterodactylUserId = userInfo.id;
        break;

      case 'username_api':
        if (!identifier) {
          const embed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ Missing Username')
            .setDescription('Username is required when using the username + API key method.')
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        // Verify username matches the API key user
        if (userInfo.username.toLowerCase() !== identifier.toLowerCase()) {
          const embed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ Username Mismatch')
            .setDescription('The provided username does not match the API key owner.')
            .addFields(
              { name: 'Expected Username', value: userInfo.username, inline: true },
              { name: 'Provided Username', value: identifier, inline: true }
            )
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          return;
        }
        pterodactylUserId = userInfo.id;
        break;

      default:
        throw new Error('Invalid binding method');
    }

    // Bind the user
    await authService.bindUser(interaction.user.id, pterodactylUserId, apiKey);

    const embed = new EmbedBuilder()
      .setColor('Green')
      .setTitle('✅ Account Bound Successfully')
      .setDescription(`Your Discord account has been successfully bound to your Pterodactyl account!`)
      .addFields(
        { name: '👤 Pterodactyl User', value: userInfo.username, inline: true },
        { name: '📧 Email', value: userInfo.email, inline: true },
        { name: '🆔 User ID', value: pterodactylUserId.toString(), inline: true },
        { name: '🎯 Binding Method', value: method === 'api_key' ? 'API Key Only' : method === 'email_api' ? 'Email + API Key' : 'Username + API Key', inline: true },
        { name: '🎮 Available Commands', value: '`/servers` - View your servers\n`/create-server` - Create a new server\n`/status` - Check binding status', inline: false }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    Logger.info(`User ${interaction.user.tag} bound their account to Pterodactyl user ${userInfo.username} (${pterodactylUserId})`);

  } catch (error) {
    Logger.error('Error in bind command:', error);
    
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Error')
      .setDescription('An error occurred while binding your account. Please try again later.')
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
    // Check if user is already bound
    const isAlreadyBound = await authService.isUserBound(message.author.id);
    if (isAlreadyBound) {
      const currentUser = await authService.getBoundUser(message.author.id);
      const embed = new EmbedBuilder()
        .setColor('Orange')
        .setTitle('⚠️ Account Already Bound')
        .setDescription('Your Discord account is already bound to a Pterodactyl account!')
        .addFields(
          { 
            name: '📋 Current Binding', 
            value: `**User ID:** ${currentUser?.pterodactyl_user_id}\n**API Key:** \`${currentUser?.pterodactyl_api_key.substring(0, 8)}...\``, 
            inline: false 
          },
          {
            name: '🔄 To Bind a Different Account',
            value: 'You must first unbind your current account using `!unbind`, then use `!bind` again with your new credentials.',
            inline: false
          },
          {
            name: '📊 Check Current Status',
            value: 'Use `!status` to see your current binding information.',
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
    if (args.length < 1) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ Invalid Usage')
        .setDescription('You need to provide your Pterodactyl API key to bind your account.')
        .addFields(
          { 
            name: 'Usage Options:', 
            value: '• `!bind <api_key>` - Bind with API key only (recommended)\n• `!bind <api_key> email <your_email>` - Bind with email verification\n• `!bind <api_key> username <your_username>` - Bind with username verification',
            inline: false 
          },
          { 
            name: 'Example:', 
            value: '`!bind ptlc_your_api_key_here`',
            inline: false 
          },
          {
            name: 'How to get your API key:',
            value: '1. Go to your Pterodactyl panel\n2. Click on your account (top right)\n3. Go to "API Credentials"\n4. Create a new API key\n5. Copy the key and use it here',
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

    const apiKey = args[0];
    let method = 'api_key';
    let identifier: string | undefined;

    // Parse additional arguments for method and identifier
    if (args.length >= 3) {
      const methodArg = args[1].toLowerCase();
      if (methodArg === 'email') {
        method = 'email_api';
        identifier = args[2];
      } else if (methodArg === 'username') {
        method = 'username_api';
        identifier = args[2];
      }
    }

    const reply = await message.reply({ 
      content: '🔄 Binding account...',
      allowedMentions: { repliedUser: false }
    });

    // Verify the API key works and get user info
    pterodactylService.setUserApiKey(apiKey);
    
    let userInfo;
    try {
      // Try to get user info from the client API
      userInfo = await pterodactylService.getClientUserInfo();
    } catch (error) {
      const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('❌ Invalid API Key')
        .setDescription('The provided API key is invalid or expired. Please check your API key and try again.')
        .addFields(
          { 
            name: 'How to get your API key:', 
            value: '1. Go to your Pterodactyl panel\n2. Click on your account (top right)\n3. Go to "API Credentials"\n4. Create a new API key\n5. Copy the key and use it here',
            inline: false 
          }
        )
        .setTimestamp();

      await reply.edit({ content: '', embeds: [embed] });
      return;
    }

    let pterodactylUserId: number;

    switch (method) {
      case 'api_key':
        // Use the user info from the API key (most reliable method)
        pterodactylUserId = userInfo.id;
        break;

      case 'email_api':
        if (!identifier) {
          const embed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ Missing Email')
            .setDescription('Email is required when using the email + API key method.')
            .setTimestamp();

          await reply.edit({ content: '', embeds: [embed] });
          return;
        }

        // Verify email matches the API key user
        if (userInfo.email.toLowerCase() !== identifier.toLowerCase()) {
          const embed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ Email Mismatch')
            .setDescription('The provided email does not match the API key owner.')
            .addFields(
              { name: 'Expected Email', value: userInfo.email, inline: true },
              { name: 'Provided Email', value: identifier, inline: true }
            )
            .setTimestamp();

          await reply.edit({ content: '', embeds: [embed] });
          return;
        }
        pterodactylUserId = userInfo.id;
        break;

      case 'username_api':
        if (!identifier) {
          const embed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ Missing Username')
            .setDescription('Username is required when using the username + API key method.')
            .setTimestamp();

          await reply.edit({ content: '', embeds: [embed] });
          return;
        }

        // Verify username matches the API key user
        if (userInfo.username.toLowerCase() !== identifier.toLowerCase()) {
          const embed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ Username Mismatch')
            .setDescription('The provided username does not match the API key owner.')
            .addFields(
              { name: 'Expected Username', value: userInfo.username, inline: true },
              { name: 'Provided Username', value: identifier, inline: true }
            )
            .setTimestamp();

          await reply.edit({ content: '', embeds: [embed] });
          return;
        }
        pterodactylUserId = userInfo.id;
        break;

      default:
        throw new Error('Invalid binding method');
    }

    // Bind the user
    await authService.bindUser(message.author.id, pterodactylUserId, apiKey);

    const embed = new EmbedBuilder()
      .setColor('Green')
      .setTitle('✅ Account Bound Successfully')
      .setDescription(`Your Discord account has been successfully bound to your Pterodactyl account!`)
      .addFields(
        { name: '👤 Pterodactyl User', value: userInfo.username, inline: true },
        { name: '📧 Email', value: userInfo.email, inline: true },
        { name: '🆔 User ID', value: pterodactylUserId.toString(), inline: true },
        { name: '🎯 Binding Method', value: method === 'api_key' ? 'API Key Only' : method === 'email_api' ? 'Email + API Key' : 'Username + API Key', inline: true },
        { name: '🎮 Available Commands', value: '`/servers` or `!servers` - View your servers\n`/create-server` or `!create-server` - Create a new server\n`/status` or `!status` - Check binding status', inline: false }
      )
      .setTimestamp();

    await reply.edit({ content: '', embeds: [embed] });
    Logger.info(`User ${message.author.tag} bound their account to Pterodactyl user ${userInfo.username} (${pterodactylUserId})`);

  } catch (error) {
    Logger.error('Error in bind command:', error);
    
    const embed = new EmbedBuilder()
      .setColor('Red')
      .setTitle('❌ Error')
      .setDescription('An error occurred while binding your account. Please try again later.')
      .setTimestamp();

    await message.reply({ 
      embeds: [embed],
      allowedMentions: { repliedUser: false }
    });
  }
}
