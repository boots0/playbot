// commands/submit-idea.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('submit-idea')
    .setDescription('Submit a stock trade idea')
    .addStringOption(opt =>
      opt.setName('ticker')
         .setDescription('Ticker symbol (e.g. AAPL)')
         .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('play')
         .setDescription('Your play (e.g. Buy Calls)')
         .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('thesis')
         .setDescription('Brief thesis/details')
         .setRequired(true)
    )
    .addAttachmentOption(opt =>
      opt.setName('image')
         .setDescription('Upload your screenshot/chart')
         .setRequired(false)
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const ticker    = interaction.options.getString('ticker');
    const play      = interaction.options.getString('play');
    const thesis    = interaction.options.getString('thesis');
    const attachment= interaction.options.getAttachment('image');

    // Build the embed
    const embed = new EmbedBuilder()
      .setTitle(`💡 ${ticker} — ${play}`)
      .setDescription(thesis)
      .setFooter({ text: `Submitted by ${interaction.user.tag}` })
      .setTimestamp();

    if (attachment) {
      embed.setImage(attachment.url);
    }

    // Post to your Forum (or Text) channel
    const channel = await client.channels.fetch(process.env.TARGET_CHANNEL_ID);
    if (channel.type === ChannelType.GuildForum) {
      await channel.threads.create({
        name: `💡 ${ticker} — ${play}`,
        autoArchiveDuration: 1440,
        message: { embeds: [embed] }
      });
    } else {
      await channel.send({ embeds: [embed] });
    }

    await interaction.editReply({ content: '✅ Idea submitted!' });
  }
};
