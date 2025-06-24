const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Deletes messages older than 2 days from the designated channel.')
    // Restrict this command to Administrators by default
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Execution logic
  async execute(interaction) {
    // Defer the reply to give the bot time to process
    await interaction.deferReply({ ephemeral: true });

    const channelId = process.env.CLEAR_CHANNEL_ID;

    // 1. Check if the channel ID is configured in the .env file
    if (!channelId) {
      console.log('CLEAR_CHANNEL_ID is not set in the .env file.');
      return interaction.editReply({ content: '❌ The channel for this command has not been configured by the bot owner.' });
    }

    try {
      // 2. Fetch the channel from Discord
      const channel = await interaction.client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        return interaction.editReply({ content: '❌ The configured channel is not a valid text channel.' });
      }

      // 3. Calculate the timestamp for 2 days ago
      const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);

      // 4. Fetch the last 100 messages from the channel
      const messages = await channel.messages.fetch({ limit: 100 });

      // 5. Filter messages to find those older than 2 days
      const messagesToDelete = messages.filter(m => m.createdTimestamp < twoDaysAgo);

      if (messagesToDelete.size === 0) {
        return interaction.editReply({ content: '✅ No messages older than 2 days were found to delete.' });
      }

      // 6. Separate messages for bulk deletion vs. individual deletion
      // Discord's bulkDelete can only be used on messages newer than 14 days
      const bulkDeletable = messagesToDelete.filter(m => m.createdTimestamp > twoWeeksAgo);
      const oldMessages = messagesToDelete.filter(m => m.createdTimestamp <= twoWeeksAgo);

      let deletedCount = 0;

      // Bulk delete newer messages (more efficient)
      if (bulkDeletable.size > 0) {
        const deleted = await channel.bulkDelete(bulkDeletable, true);
        deletedCount += deleted.size;
      }

      // Delete very old messages one by one
      for (const message of oldMessages.values()) {
        await message.delete();
        deletedCount++;
      }
      
      return interaction.editReply({ content: `✅ Successfully deleted ${deletedCount} message(s) from <#${channel.id}>.` });

    } catch (error) {
      console.error('Error executing /clear command:', error);
      return interaction.editReply({ content: '❌ An error occurred while trying to clear messages. Please check the console.' });
    }
  },
};