// index.js
// Main entry point for the Moja Discord Bot, including the cron trigger server.

require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ChannelType 
} = require('discord.js');
const fs   = require('fs');
const path = require('path');
const express = require('express');
const { generateReport } = require('./commands/report.js'); // Import the report function

// --- Discord Client Setup ---
// We need Guilds and MessageContent intents for the bot's core functions.
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent 
  ] 
});

client.commands = new Map();

// Load all command modules from the ./commands directory
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsPath, file));
  client.commands.set(cmd.data.name, cmd);
}

// --- Express Server Setup for Cron Trigger ---
const app = express();
const port = process.env.PORT || 3000;

// **NEW**: Add a root route to handle Railway's health checks
app.get('/', (req, res) => {
  res.status(200).send('Moja is online and listening!');
});

// This is the secure endpoint that Railway's cron job will call.
app.post('/run-report', async (req, res) => {
  // 1. Secure the endpoint with a secret key from your .env file
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn('Unauthorized attempt to run report.');
    return res.status(401).send('Unauthorized');
  }

  // 2. Ensure the Discord bot is fully logged in and ready
  if (!client.isReady()) {
    console.error('Report trigger failed: Bot is not ready yet.');
    return res.status(503).json({ message: 'Bot is not ready yet. Please try again in a moment.' });
  }
  
  // 3. Run the report logic
  console.log('Authorized request received. Generating report...');
  const result = await generateReport(client);
  
  if (result.success) {
    console.log('Scheduled report generated successfully.');
    res.status(200).json({ message: result.message });
  } else {
    console.error('Scheduled report generation failed:', result.message);
    res.status(500).json({ message: result.message });
  }
});

// Start the Express server to listen for cron job triggers
app.listen(port, () => {
  console.log(`Moja's trigger server is listening on port ${port}`);
});


// --- Discord Event Handlers ---
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  // Slash command handling
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction, client);
    } catch (err) {
      console.error(err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '❌ Error executing command.', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ Error executing command.', ephemeral: true });
      }
    }
    return;
  }

  // Modal submission handling
  if (interaction.isModalSubmit() && interaction.customId === 'submitIdeaModal') {
    const ticker = interaction.fields.getTextInputValue('tickerInput');
    const thesis = interaction.fields.getTextInputValue('thesisInput');
    const play   = interaction.fields.getTextInputValue('playInput');

    const embed = new EmbedBuilder()
      .setDescription(thesis)
      .setFooter({ text: `Submitted by ${interaction.user.tag}` })
      .setTimestamp();

    const channel = await client.channels.fetch(process.env.TARGET_CHANNEL_ID);

    if (channel.type === ChannelType.GuildForum) {
      await channel.threads.create({
        name: `💡 ${ticker} — ${play}`,
        autoArchiveDuration: 1440,
        message: { embeds: [embed] }
      });
    } else {
      embed.setTitle(`💡 ${ticker} — ${play}`);
      await channel.send({ embeds: [embed] });
    }

    await interaction.reply({ content: '✅ Idea submitted!', ephemeral: true });
  }
});

// Login to Discord with your app's token
client.login(process.env.DISCORD_TOKEN);
