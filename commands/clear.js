const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, Collection } = require('discord.js');

module.exports = {
  // Command definition is unchanged
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Deletes forum posts older than 2 days from the designated channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channelId = process.env.CLEAR_CHANNEL_ID;
    if (!channelId) {
      console.log('CLEAR_CHANNEL_ID is not set in the .env file.');
      return interaction.editReply({ content: '❌ The channel for this command has not been configured by the bot owner.' });
    }

    try {
      const channel = await interaction.client.channels.fetch(channelId);

      if (channel.type !== ChannelType.GuildForum) {
        return interaction.editReply({ content: '❌ The configured channel is not a Forum Channel.' });
      }

      // --- NEW, SIMPLIFIED LOGIC ---

      // 1. Fetch all threads (posts) from the forum
      const activeThreads = await channel.threads.fetchActive();
      const archivedThreads = await channel.threads.fetchArchived();
      const allThreads = new Collection([...activeThreads.threads.entries(), ...archivedThreads.threads.entries()]);

      if (allThreads.size === 0) {
        return interaction.editReply({ content: '✅ No posts were found in the forum to clear.' });
      }

      let deletedPostsCount = 0;
      const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
      
      // 2. Loop through each post and check its creation date
      for (const thread of allThreads.values()) {
        // Check if the THREAD itself is older than 2 days
        if (thread.createdTimestamp < twoDaysAgo) {
          try {
            // 3. Delete the entire thread (the post)
            await thread.delete();
            deletedPostsCount++;
          } catch (err) {
            console.error(`Failed to delete thread ${thread.name} (${thread.id}):`, err);
            // This catch prevents one failed deletion from stopping the whole process
          }
        }
      }
      
      return interaction.editReply({ content: `✅ Scanned ${allThreads.size} posts and deleted ${deletedPostsCount} that were older than 2 days.` });

    } catch (error) {
      console.error('Error executing /clear command:', error);
      return interaction.editReply({ content: '❌ An error occurred while trying to clear posts. Please check the console.' });
    }
  },
};