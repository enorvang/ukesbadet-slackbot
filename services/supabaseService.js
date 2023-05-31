const { createClient } = require("@supabase/supabase-js");

const supabaseClient = createClient(
  process.env.API_URL,
  process.env.PUBLIC_KEY
);

const getScoreForUser = async (userId) => {
  const { count } = await supabaseClient
    .from("baths")
    .select("*", { count: "exact" })
    .eq("user_slack_id", userId);
  return count;
};

const getAverageTempForUser = async (userId) => {
  const { data, count } = await supabaseClient
    .from("baths")
    .select("*", { count: "exact" })
    .eq("user_slack_id", userId);

  const total = data.reduce((acc, curr) => acc + curr.temperature, 0);
  return (total / count).toFixed(2);
};

exports.getScoreForUser = getScoreForUser;
exports.getAverageTempForUser = getAverageTempForUser;
