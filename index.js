const { Client, Intents, MessageEmbed } = require("discord.js");
const SpotifyWebApi = require("spotify-web-api-node");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
  StreamType,
  AudioPlayerStatus,
  NoSubscriberBehavior,
} = require("@discordjs/voice");
const ytdl = require("ytdl-core");
const YoutubeAPI = require("discord-youtube-api");
const dotenv = require("dotenv");

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_VOICE_STATES,
    Intents.FLAGS.GUILD_MESSAGES,
  ],
});
dotenv.config();

console.log(process.env.SPOTIFY_CLIENT_ID);
console.log(process.env.SPOTIFY_CLIENT_SECRET);

const youtube = new YoutubeAPI(process.env.YOUTUBE_API_KEY);
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

spotifyApi.clientCredentialsGrant().then(
  function (data) {
    // console.log("Access Token alındı: " + data.body["access_token"]);
    spotifyApi.setAccessToken(data.body["access_token"]);
  },
  function (err) {
    console.log("Access Token alınamadı!", err);
  }
);

client.once("ready", () => {
  console.log("Bot is ready");
  // const channel = client.channels.cache.get("1095314688524431430");  // kanal id'si ekle
  // const style = new MessageEmbed()
  //   .setColor("#0099ff")
  //   .setTitle("şimşek hazır!");
  // channel.send({ embeds: [style] });
});

// !play
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!play")) return;

  // console.log("!play komutu alındı");

  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply("bilader bi ses kanalına gir önce!");

    console.log("ses kanalında değilsin");
  }

  const query = message.content.slice(6);
  const videoUrl = await getYoutubeVideoUrl(query);

  // console.log("QUERY : " + query);
  // console.log("VIDEO URL : " + videoUrl);

  if (!videoUrl) {
    return message.reply(`sonuç yok gülüm yutubun suçu : '${query}'`);
  }

  message.reply(`oynatim şunu : ${videoUrl}`);

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
  });

  const stream = ytdl(videoUrl, { filter: "audioonly" });
  const player = createAudioPlayer();
  const resource = createAudioResource(stream, { type: StreamType.Arbitrary });
  await player.play(resource);
  connection.subscribe(player);

  player.on(AudioPlayerStatus.Idle, () => {
    connection.destroy();
  });

  player.on(AudioPlayerStatus.AutoPaused, () => {
    connection.destroy();
  });

  player.on("error", (error) => {
    console.error(error);
    connection.destroy();
  });
});

// !spotify
client.on("messageCreate", async (message) => {
  if (message.content.startsWith("!spotify")) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply("Bir ses kanalında değilsin!");
    }

    const playlistUrl = message.content.slice(8);

    let tracks = [];
    try {
      const playlistId = playlistUrl.split("/playlist/")[1].split("?")[0];
      const { body } = await spotifyApi.getPlaylistTracks(playlistId);
      tracks = body.items.map((item) => item.track);
    } catch (error) {
      console.error(error);
      return message.reply("Spotify playlisti bulunamadı!");
    }

    if (tracks.length === 0) {
      return message.reply("Playlist boş!");
    }

    // console.log(tracks);

    const tracksYoutubeURLs = [];
    for (const track of tracks) {
      const videoUrl = await getYoutubeVideoUrl(
        `${track.artists[0].name} - ${track.name}`
      );
      console.log(videoUrl);

      if (videoUrl) {
        tracksYoutubeURLs.push(videoUrl);
      }
    }
    console.log(tracksYoutubeURLs);

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    // Şarkıları oynat
    const player = createAudioPlayer();
    connection.subscribe(player);

    for (const trackUrl of tracksYoutubeURLs) {
      const stream = ytdl(trackUrl, {
        filter: "audioonly",
        quality: "highestaudio",
      });
      const resource = createAudioResource(stream);
      player.play(resource);

      // Şarkı bitene kadar bekle
      await new Promise((resolve) => {
        player.once("idle", () => {
          resolve();
        });
      });
    }

    connection.disconnect();
    message.channel.send("Playlist bitti!");
  }
});

// !stop
client.on("messageCreate", async (message) => {
  if (message.content === "!stop") {
    console.log("stop komutunu aldim kardesim");
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply("bilader bi ses kanalına gir önce!");
    }

    const connection = getVoiceConnection(voiceChannel.guild.id);
    if (!connection) {
      return message.reply("valla oynatmıyom zaten bi şey.");
    }

    // Check if the connection is already destroyed before destroying it
    if (connection.state.status !== "destroyed") {
      console.log("MUZIGI DURDURUP CIKIOM BEN");
      const botMember = voiceChannel.guild.members.cache.get(client.user.id);
      botMember.voice.setChannel(null);

      return message.reply("ben kaçar.");
    } else {
      return message.reply("valla oynatmıyom zaten bi şey.");
    }
  }
});

// !help
client.on("messageCreate", async (message) => {
  if (message.content === "!help") {
    const style = new MessageEmbed()
      .setColor("#0099ff")
      .setTitle("Komutlar")
      .setDescription(
        `!play {sarki-adi} / {youtube_linki}\n\n !spotify {spotify_playlist_linki}\n\n !stop`
      );

    message.reply({ embeds: [style] });
  }
});

async function getYoutubeVideoUrl(query) {
  let videoUrl;
  console.log("QUERY LINK YA DA ISIM : " + query);

  try {
    if (ytdl.validateURL(query)) {
      videoUrl = query;
    } else {
      const englishQuery = turkishToEnglish(query);
      const results = await youtube.searchVideos(englishQuery, {
        regionCode: "TR",
        maxResults: 1,
        order: "relevance",
      });
      // console.log("RESULTS: " + JSON.stringify(results, null, 2));
      if (results.length === 0) {
        return null;
      }
      videoUrl = `https://www.youtube.com/watch?v=${results.id}`;
    }
  } catch (error) {
    // console.error(error);
    return null;
  }

  return videoUrl;
}

function turkishToEnglish(str) {
  const turkishChars = "ğĞıİöÖüÜşŞçÇ";
  const englishChars = "gGiIoOuUsScC";

  let result = "";

  for (let i = 0; i < str.length; i++) {
    const index = turkishChars.indexOf(str[i]);
    if (index === -1) {
      result += str[i];
    } else {
      result += englishChars[index];
    }
  }

  return result;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

client.login(process.env.TOKEN);
