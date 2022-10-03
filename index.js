require("dotenv").config();
const { App, ExpressReceiver } = require("@slack/bolt");
const { createClient } = require("@supabase/supabase-js");

const supabaseClient = createClient(
  process.env.API_URL,
  process.env.PUBLIC_KEY
);

const PORT = process.env.PORT || 3000;

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

(async () => {
  await app.start(PORT);
  console.log(`Running on port: ${PORT}`);
})();

receiver.router.post("/slack/events", (req, res) => {
  if (req?.body?.challenge) res.send({ challenge });
});

app.command("/badet", async ({ ack, say, command }) => {
  await ack();

  if (!command.text.includes("@")) {
    await say(
      `<@${command.user_id}> Du må tagge den du har badet med for å registrere badet`
    );
    return;
  }

  const userId = command.text.split("@")[1].split("|")[0];
  const { data, error } = await supabaseClient
    .from("users")
    .select("*")
    .eq("slack_username", userId);

  if (data.length === 1) {
    const badeBuddy = data[0].slack_id;
    await supabaseClient
      .from("baths")
      .insert([
        { user_slack_id: command.user_id },
        { user_slack_id: badeBuddy },
      ]);

    await say(`<@${command.user_id}> har badet med <@${badeBuddy}>!`);
  }
});

app.command(`/score`, async ({ ack, say, command }) => {
  await ack();
  const { count } = await supabaseClient
    .from("baths")
    .select("*", { count: "exact" })
    .eq("user_slack_id", command.user_id);

  await say(`<@${command.user_id}> har badet ${count} ganger`);
});

app.command(`/info`, async ({ ack, say, command }) => {
  await ack();
  const { channel_id } = command;

  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<#${channel_id}> er et engasjement som har fokus på personlig helse og å sosialisere seg med kollegaer i Stacc:star:. Konseptet går ut på å bade hver uke sammen med dine kollegaer.`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Reglene er enkle:*\n• Man kan maks få 1 poeng per uke\n• Man er nødt til å bade sammen med én eller flere kollegaer",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Skriv `/help` for å se en liste over kommandoer",
        },
      },
    ],
  });
});

app.command(`/help`, async ({ ack, say }) => {
  await ack();
  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Kommandoer:*\n• `/info` - Info om konseptet\n• `/register` - Registrerer brukeren din i databasen\n• `/badet @<din-badebuddy>` - Registrerer et bad for deg og den du har badet med. Dette kan kun gjøres én gang per uke\n• `/score` - Viser hvor mange ganger du har badet",
        },
      },
    ],
  });
});

app.command(`/register`, async ({ ack, say, command }) => {
  await ack();
  const { user_id, user_name, channel_id } = command;
  const { data: users } = await supabaseClient
    .from("users")
    .select("slack_id")
    .eq("slack_id", user_id);
  if (users.length === 0) {
    await supabaseClient
      .from("users")
      .insert([{ slack_id: user_id, slack_username: user_name }]);
    await say(
      `Hei <@${user_id}> og velkommen til <#${channel_id}>! Skriv /info for å lese mer om konseptet.`
    );
  }
});
