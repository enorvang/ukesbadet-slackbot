require("dotenv").config();
const { App, ExpressReceiver } = require("@slack/bolt");
const { createClient } = require("@supabase/supabase-js");
const { getWaterTemperatures, getWaterTemperature } = require("./services/temperatureService");

const supabaseClient = createClient(
  process.env.API_URL,
  process.env.PUBLIC_KEY
);
const handleBathInsert = (payload) => {
  console.log("new bath", payload)
}

const DEFAULT_LOCATION_ID = 2

const PORT = process.env.PORT || 3000;

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});


// A more generic, global error handler
app.error((error) => {
  // Check the details of the error to handle cases where you should retry sending a message or stop the app
  console.error(error);
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
  const users = command.text.split(" ")
    .filter((user) => user.includes("@"))
    .map(user => user.replace("@", ""));
  console.log("users", users)

  const { data, error } = await supabaseClient
    .from("users")
    .select("*")
    .in("slack_username", users)

  if (data.length > 0) {
    console.log(data)

    const badeBuddy = data[0].slack_id;
    const temperatureLocation = await getWaterTemperature(DEFAULT_LOCATION_ID);
    
    if(false) {
      await supabaseClient
      .from("baths")
      .insert([
        { 
          user_slack_id: command.user_id,
          temperature: temperatureLocation?.temperature
         },
        { 
          user_slack_id: badeBuddy,
          temperature: temperatureLocation?.temperature

        },
      ]);
    }
   

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
  console.log("hello")
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

app.command('/temperature', async ({ack, say, command}) => {
  await ack();
  const location = await getWaterTemperature(DEFAULT_LOCATION_ID);
  const date = new Date(location?.time)
    
    await say(
      `Temperatur på ${location.location_name}: ${location.temperature}\u00B0C, ${date.toLocaleString()}`
    )
  }
)
