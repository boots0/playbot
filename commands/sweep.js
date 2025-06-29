// commands/sweep.js
const {
  SlashCommandBuilder,
  ChannelType
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sweep')
    .setDescription('Move 📁-tagged plays from active to archived'),

  async execute(interaction) {
    try {
      // defer ephemerally
      await interaction.deferReply({ ephemeral: true });

      const client = interaction.client;
      const src = await client.channels.fetch(process.env.ACTIVE_PLAYED_CHANNEL_ID);
      const dst = await client.channels.fetch(process.env.ARCHIVED_PLAYS_CHANNEL_ID);

      // Ensure both are Forum channels
      if (src.type !== ChannelType.GuildForum || dst.type !== ChannelType.GuildForum) {
        return interaction.editReply('❌ One of those isn’t a Forum channel.');
      }

      // Fetch active threads and filter by your Archive tag
      const { threads } = await src.threads.fetchActive();
      const tagId     = process.env.ARCHIVE_TAG_ID;
      const toMove    = threads.filter(t => t.appliedTags.includes(tagId));

      if (!toMove.size) {
        return interaction.editReply('ℹ️ No threads found with the 📁 Archive tag.');
      }

      let moved = 0;
      for (const thread of toMove.values()) {
        // 1) Grab the original starter message
        const starter = await thread.fetchStarterMessage();

        // 2) Build a non-empty payload for the new thread
        const messageOptions = {};
        if (starter.content) {
          messageOptions.content = starter.content;
        }
        if (starter.embeds && starter.embeds.length) {
          messageOptions.embeds = starter.embeds;
        }
        if (starter.attachments && starter.attachments.size) {
          messageOptions.files = starter.attachments.map(a => a.url);
        }
        // Fallback if there's truly no content/embed
        if (!messageOptions.content && !messageOptions.embeds) {
          messageOptions.content = thread.name;
        }

        // 3) Create it in the archived forum
        await dst.threads.create({
          name: thread.name,
          autoArchiveDuration: thread.autoArchiveDuration,
          message: messageOptions
        });

        // 4) Archive the original
        await thread.setArchived(true);
        moved++;
      }

      return interaction.editReply(
        `✅ Moved ${moved} thread(s) to <#${dst.id}> and archived the originals.`
      );
    } catch (err) {
      console.error('❌ sweep command error:', err);
      // Safely reply or edit
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply('❌ Something went wrong during sweep. Check the logs.');
      } else {
        return interaction.reply({ content: '❌ Something went wrong during sweep.', ephemeral: true });
      }
    }
  }
};
