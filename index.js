// index.js
require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ChannelType 
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Map();

// 1) Load all command modules from ./commands
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  client.commands.set(cmd.data.name, cmd);
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  // 2) Slash command handling
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction, client);
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ Error executing command.', ephemeral: true });
    }
    return;
  }

  // 3) Modal submission handling
  if (interaction.isModalSubmit() && interaction.customId === 'submitIdeaModal') {
    const ticker = interaction.fields.getTextInputValue('tickerInput');
    const thesis = interaction.fields.getTextInputValue('thesisInput');
    const play   = interaction.fields.getTextInputValue('playInput');

    // Build the embed for the post body
    const embed = new EmbedBuilder()
      .setDescription(thesis)
      .setFooter({ text: `Submitted by ${interaction.user.tag}` })
      .setTimestamp();

    // Fetch your target channel (Forum or Text)
    const channel = await client.channels.fetch(process.env.TARGET_CHANNEL_ID);

    if (channel.type === ChannelType.GuildForum) {
      // Create a new forum thread (post)
      await channel.threads.create({
        name: `💡 ${ticker} — ${play}`,   // becomes the forum post title
        autoArchiveDuration: 1440,       // archive after 24h of inactivity
        message: { embeds: [embed] }     // the first message in the thread
      });
    } else {
      // Fallback for normal text channels
      embed.setTitle(`💡 ${ticker} — ${play}`);
      await channel.send({ embeds: [embed] });
    }

    await interaction.reply({ content: '✅ Idea submitted!', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
