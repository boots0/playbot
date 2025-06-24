const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, Collection } = require('discord.js');

module.exports = {
  // Command definition (no changes here)
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Deletes messages older than 2 days from the designated channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Execution logic
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channelId = process.env.CLEAR_CHANNEL_ID;
    if (!channelId) {
      console.log('CLEAR_CHANNEL_ID is not set in the .env file.');
      return interaction.editReply({ content: '❌ The channel for this command has not been configured by the bot owner.' });
    }

    try {
      const channel = await interaction.client.channels.fetch(channelId);

      // --- NEW LOGIC STARTS HERE ---

      // 1. Verify the channel is a Forum Channel
      if (channel.type !== ChannelType.GuildForum) {
        return interaction.editReply({ content: '❌ The configured channel is not a Forum Channel. This command is now configured for forums.' });
      }

      // 2. Fetch all threads (posts) from the forum
      const activeThreads = await channel.threads.fetchActive();
      const archivedThreads = await channel.threads.fetchArchived();
      
      const allThreads = new Collection([...activeThreads.threads.entries(), ...archivedThreads.threads.entries()]);

      if (allThreads.size === 0) {
        return interaction.editReply({ content: '✅ No threads found in the forum to clear.' });
      }

      let totalDeletedCount = 0;
      const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
      
      // 3. Loop through each thread and clear messages inside it
      for (const thread of allThreads.values()) {
        const messages = await thread.messages.fetch({ limit: 100 });
        const messagesToDelete = messages.filter(m => m.createdTimestamp < twoDaysAgo);

        if (messagesToDelete.size === 0) {
          continue; // Skip to the next thread if no old messages are found
        }

        const bulkDeletable = messagesToDelete.filter(m => m.createdTimestamp > twoWeeksAgo);
        const oldMessages = messagesToDelete.filter(m => m.createdTimestamp <= twoWeeksAgo);

        if (bulkDeletable.size > 0) {
          const deleted = await thread.bulkDelete(bulkDeletable, true);
          totalDeletedCount += deleted.size;
        }

        for (const message of oldMessages.values()) {
          await message.delete();
          totalDeletedCount++;
        }
      }
      
      // 4. Report the final count
      return interaction.editReply({ content: `✅ Swept through ${allThreads.size} threads and deleted a total of ${totalDeletedCount} message(s) from <#${channel.id}>.` });

    } catch (error) {
      console.error('Error executing /clear command:', error);
      return interaction.editReply({ content: '❌ An error occurred while trying to clear messages. Please check the console.' });
    }
  },
};