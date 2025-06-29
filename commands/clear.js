const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, Collection, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Deletes forum posts older than 2 days from the designated channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // CHANGED: Using flags for an ephemeral reply
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

      const activeThreads = await channel.threads.fetchActive();
      const archivedThreads = await channel.threads.fetchArchived();
      
      const allThreads = new Collection([...activeThreads.threads.entries(), ...archivedThreads.threads.entries()]);

      if (allThreads.size === 0) {
        return interaction.editReply({ content: '✅ No posts were found in the forum to clear.' });
      }

      let deletedPostsCount = 0;
      const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
      
      for (const thread of allThreads.values()) {
        if (thread.createdTimestamp < twoDaysAgo) {
          try {
            await thread.delete();
            deletedPostsCount++;
          } catch (err) {
            console.error(`Failed to delete thread ${thread.name} (${thread.id}):`, err);
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